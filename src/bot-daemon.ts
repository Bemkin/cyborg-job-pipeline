import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import nodemailer from "nodemailer";
import http from "http";
import crypto from "crypto";
import { validateCorporateEmail, verifyWithNeverBounce, verifyWithVerimail } from "./utils/emailValidator";
import { CachedDraft, loadDrafts, updateDraft, writeDrafts } from "./drafts";
import { CandidateTrackKey, Profile, TRACK_KEYS, loadProfile } from "./profile";
import { getPersona, loadResumeAttachment } from "./data/candidatePersonas";
import { getSmtpConfig, createSmtpTransporter } from "./smtp";

dotenv.config();

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();
const SYNC_SECRET = (process.env.SYNC_SECRET || "").trim();

function exitWithError(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function checkDaemonConfig(): Profile {
  if (!TELEGRAM_TOKEN) exitWithError("TELEGRAM_BOT_TOKEN is missing in .env");
  if (!TELEGRAM_CHAT_ID) exitWithError("TELEGRAM_CHAT_ID is missing in .env (the bot only answers this chat)");

  const smtp = getSmtpConfig();
  if (smtp.isCustomSmtp) {
    if (!smtp.auth.user || !smtp.auth.pass) {
      exitWithError("SMTP_USER (or GMAIL_USER) and SMTP_PASS (or GMAIL_APP_PASSWORD) are missing in .env for custom SMTP");
    }
  } else {
    if (!smtp.auth.user || !smtp.auth.pass) {
      exitWithError("GMAIL_USER or GMAIL_APP_PASSWORD is missing in .env (or configure SMTP_HOST, SMTP_USER, SMTP_PASS)");
    }
  }

  if (process.env.GMAIL_WEBHOOK_URL && !SYNC_SECRET) {
    exitWithError("SYNC_SECRET is required when GMAIL_WEBHOOK_URL is set");
  }
  try {
    return loadProfile();
  } catch (err: any) {
    exitWithError(err.message);
  }
}

function isOwnerChat(chatId: number | string | undefined): boolean {
  return chatId !== undefined && String(chatId) === TELEGRAM_CHAT_ID;
}

function hasValidSyncSecret(header: string | string[] | undefined): boolean {
  if (!SYNC_SECRET || typeof header !== "string") return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(SYNC_SECRET);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// The resume is chosen from the profile by track, never from a filename or path
// in the draft itself: drafts arrive over HTTP and must not choose what gets attached.
function personaForDraft(profile: Profile, draft: CachedDraft) {
  const track = TRACK_KEYS.includes(draft.track as CandidateTrackKey)
    ? (draft.track as CandidateTrackKey)
    : profile.defaultPersona;
  return getPersona(profile, track);
}

// ─────────────────────────────────────────────
// Email Transporter & HTTPS Bridge
// ─────────────────────────────────────────────

const transporter = createSmtpTransporter();

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export async function sendEmail({
  fromName,
  to,
  subject,
  body,
  attachments = [],
}: {
  fromName: string;
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const webhookUrl = process.env.GMAIL_WEBHOOK_URL;

  // If GMAIL_WEBHOOK_URL is set, use Google Apps Script HTTPS Bridge (bypasses Render's egress SMTP block)
  if (webhookUrl && webhookUrl.trim() !== "") {
    let attachmentBase64: string | undefined;
    let attachmentFilename: string | undefined;

    if (attachments.length > 0) {
      attachmentBase64 = attachments[0].content.toString("base64");
      attachmentFilename = attachments[0].filename;
    }

    const payload = {
      fromName,
      to,
      subject,
      body,
      attachmentBase64,
      attachmentFilename,
      secret: SYNC_SECRET,
    };

    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      // Declare UTF-8 explicitly so Apps Script decodes non-ASCII text reliably.
      // Emoji in subjects still break inside GmailApp itself, so avoid them there.
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    const rawText = await res.text();
    let result: any = null;
    try {
      result = JSON.parse(rawText);
    } catch {
      // Google Apps Script redirect responses are frequently HTML wrapper pages
      if (rawText.toLowerCase().includes("error") && !rawText.toLowerCase().includes("success")) {
        throw new Error(`Google Apps Script error: ${rawText.slice(0, 150)}`);
      }
    }

    if (result && result.success === false) {
      throw new Error(result.error || "Failed to send email via Google Apps Script HTTPS relay");
    }
    return;
  }

  // Fallback to standard SMTP (for local runs on laptop or paid clouds)
  const smtp = getSmtpConfig();
  await transporter.sendMail({
    from: `${fromName} <${smtp.fromAddress}>`,
    to,
    subject,
    text: body,
    attachments: attachments.map((a) => ({ ...a, contentType: "application/pdf" })),
  });
}

// ─────────────────────────────────────────────
// Bot Daemon
// ─────────────────────────────────────────────

interface PendingEdit {
  jobId: string;
  promptMessageId?: number;
}

const pendingEdits = new Map<number | string, PendingEdit>();

export async function startBotDaemon(): Promise<void> {
  const profile = checkDaemonConfig();
  const smtp = getSmtpConfig();

  console.log("══════════════════════════════════════════════════");
  console.log("  🤖 CYBORG TELEGRAM BOT DAEMON (v2.1)");
  if (smtp.isCustomSmtp) {
    console.log(`  ✉️ SMTP One-Tap Dispatcher Active (${smtp.host}:${smtp.port})`);
  } else {
    console.log("  ✉️ Gmail One-Tap Dispatcher Active");
  }
  console.log("══════════════════════════════════════════════════");

  // Verify Email Delivery Channel
  if (process.env.GMAIL_WEBHOOK_URL) {
    console.log("🌐 Gmail Webhook HTTPS Bridge configured (Render Free Tier Egress Safe)");
  } else {
    try {
      console.log(`🔌 Testing SMTP connection for ${smtp.fromAddress} on ${smtp.host}:${smtp.port}...`);
      await transporter.verify();
      console.log("✅ SMTP connection verified successfully!");
    } catch (err) {
      console.warn("⚠️ SMTP notice:", err);
      console.warn("   (Tip: If running on Render Free Tier, set GMAIL_WEBHOOK_URL to bypass SMTP port blocks)");
    }
  }

  const bot = new TelegramBot(TELEGRAM_TOKEN!, { polling: true });

  // Resilient network error handling (prevents crashes on sleep/wake or transient WiFi disconnects)
  bot.on("polling_error", (error: any) => {
    const msg = error?.message || String(error);
    if (!msg.includes("ENOTFOUND") && !msg.includes("ETIMEDOUT") && !msg.includes("ECONNRESET") && !msg.includes("EFATAL")) {
      console.warn("⚠️ Telegram polling notice:", msg);
    }
  });

  bot.on("error", (error: any) => {
    console.warn("⚠️ Telegram bot error notice:", error?.message || error);
  });

  process.on("uncaughtException", (err) => {
    console.error("⚠️ Uncaught exception in bot daemon (kept alive):", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("⚠️ Unhandled rejection in bot daemon (kept alive):", reason);
  });

  // ─────────────────────────────────────────────
  // HTTP Server (Render Free Tier Web Service & Keep-Alive)
  // ─────────────────────────────────────────────
  const PORT = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-sync-secret");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint (for Render & keep-alive pinger)
    if (req.method === "GET" && (pathname === "/" || pathname === "/health" || pathname === "/ping")) {
      const drafts = loadDrafts();
      const pending = Array.from(drafts.values()).filter((d) => d.status === "pending" || !d.status).length;
      const sent = Array.from(drafts.values()).filter((d) => d.status === "sent").length;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "online",
          service: "cyborg-job-pipeline-daemon",
          version: "2.2.0-gas-bridge",
          emailChannel: process.env.GMAIL_WEBHOOK_URL ? "google-apps-script-webhook" : "smtp-direct",
          hasWebhookUrl: Boolean(process.env.GMAIL_WEBHOOK_URL),
          uptimeSeconds: Math.floor(process.uptime()),
          stats: {
            totalDrafts: drafts.size,
            pendingDrafts: pending,
            sentDrafts: sent,
          },
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Drafts query endpoint
    if (req.method === "GET" && pathname === "/api/drafts") {
      if (!hasValidSyncSecret(req.headers["x-sync-secret"])) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing x-sync-secret" }));
        return;
      }

      const drafts = Array.from(loadDrafts().values());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ drafts, count: drafts.length }));
      return;
    }

    // Draft ingestion endpoint (from laptop or scraper pipeline)
    if (req.method === "POST" && (pathname === "/api/draft" || pathname === "/api/drafts")) {
      if (!hasValidSyncSecret(req.headers["x-sync-secret"])) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing x-sync-secret" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          const items: CachedDraft[] = Array.isArray(payload) ? payload : [payload];
          const draftsMap = loadDrafts();

          let savedCount = 0;
          for (const item of items) {
            if (item && item.jobId) {
              draftsMap.set(item.jobId, item);
              savedCount++;
            }
          }

          writeDrafts(draftsMap);
          console.log(`[${new Date().toISOString().slice(11, 19)}] 📥 Ingested ${savedCount} draft(s) via HTTP API`);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, count: savedCount }));
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON payload", details: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🌐 Web Service listening on http://0.0.0.0:${PORT} (Render Free Tier Ready)`);
    console.log(`   Health check: GET /health`);
    console.log(`   Draft sync:   POST /api/draft`);
  });

  console.log("👂 Listening for button taps and Telegram commands...\n");

  // Command: /status
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwnerChat(chatId)) return;
    const drafts = loadDrafts();
    const pending = Array.from(drafts.values()).filter((d) => d.status === "pending" || !d.status).length;
    const sent = Array.from(drafts.values()).filter((d) => d.status === "sent").length;
    const smtp = getSmtpConfig();
    const accountLabel = smtp.isCustomSmtp ? "SMTP Account" : "Gmail Account";

    await bot.sendMessage(
      chatId,
      `🟢 *Cyborg Bot Daemon Active*\n\n` +
        `• *${accountLabel}:* \`${smtp.fromAddress}\`\n` +
        `• *Pending Drafts:* ${pending}\n` +
        `• *Sent via One-Tap:* ${sent}\n\n` +
        `Tap Send on any job notification to fire off cold emails!`,
      { parse_mode: "Markdown" }
    );
  });

  // Command: /testemail
  bot.onText(/\/testemail/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwnerChat(chatId)) return;
    const smtp = getSmtpConfig();
    const recipient = smtp.fromAddress;
    try {
      await bot.sendMessage(chatId, `⏳ Sending test email to ${recipient}...`);
      const resume = await loadResumeAttachment(getPersona(profile, profile.defaultPersona));
      const firstName = profile.name.split(" ")[0];

      await sendEmail({
        fromName: profile.name,
        to: recipient,
        // No emoji: GmailApp mangles characters outside the BMP in subjects. The
        // em dash checks the non-ASCII characters real subjects use.
        subject: "Cyborg Pipeline Test Email — with Attached Resume",
        body: `Hey ${firstName},\n\nThis is a verification test from your Cyborg Job Pipeline. Your email integration, Telegram one-tap dispatch, and PDF resume attachment are fully operational!\n\nSent at: ${new Date().toISOString()}`,
        attachments: resume ? [resume] : [],
      });
      await bot.sendMessage(chatId, `✅ *Test email with attached resume delivered to ${recipient}!* Check your inbox.`, { parse_mode: "Markdown" });
    } catch (err: any) {
      console.error("Error sending test email:", err);
      await bot.sendMessage(chatId, `❌ *Failed to send test email:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // Handle Callback Queries (Buttons)
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const data = query.data;

    if (!isOwnerChat(chatId) || !isOwnerChat(query.from.id)) {
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (!data || !chatId || !messageId) {
      await bot.answerCallbackQuery(query.id);
      return;
    }

    const [action, jobId] = data.split(":");
    const drafts = loadDrafts();
    const draft = drafts.get(jobId);

    if (action === "send") {
      if (!draft) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Draft not found in cache.", show_alert: true });
        return;
      }

      if (!draft.recipientEmail || !draft.recipientEmail.includes("@")) {
        await bot.answerCallbackQuery(query.id, { text: "⚠️ No valid recipient email address available for this contact.", show_alert: true });
        return;
      }

      const emailValidation = validateCorporateEmail(draft.recipientEmail, draft.company);
      if (!emailValidation.valid) {
        await bot.answerCallbackQuery(query.id, {
          text: `⚠️ Safety Block: ${emailValidation.reason}. Sending aborted to prevent bounce and protect your sender reputation.`,
          show_alert: true,
        });
        return;
      }

      const vmApiKey = process.env.VERIMAIL_API_KEY;
      if (vmApiKey && vmApiKey.trim() !== "") {
        const vm = await verifyWithVerimail(draft.recipientEmail, vmApiKey);
        if (!vm.deliverable) {
          if (vm.result !== "error") {
            await bot.answerCallbackQuery(query.id, {
              text: `⚠️ Verimail Safety Block: Mailbox is "${vm.result}". Sending aborted to prevent bounce!`,
              show_alert: true,
            });
            return;
          }
          console.log(`⚠️ Verimail notice (${vm.reason}), proceeding with send via local verification.`);
        }
      } else {
        const nbApiKey = process.env.NEVERBOUNCE_API_KEY;
        if (nbApiKey && nbApiKey.trim() !== "") {
          const nb = await verifyWithNeverBounce(draft.recipientEmail, nbApiKey);
          if (!nb.valid) {
            if (nb.result !== "error") {
              await bot.answerCallbackQuery(query.id, {
                text: `⚠️ NeverBounce Safety Block: Address classified as "${nb.result}". Sending aborted to prevent bounce.`,
                show_alert: true,
              });
              return;
            }
            console.log(`⚠️ NeverBounce credit notice (${nb.reason}), proceeding with send via local verification.`);
          }
        }
      }

      try {
        await bot.answerCallbackQuery(query.id, { text: `✉️ Sending email to ${draft.recipientEmail}...` });

        // Prepare PDF attachment (persona-specific or default resume)
        const persona = personaForDraft(profile, draft);
        const resume = await loadResumeAttachment(persona);
        if (!resume) {
          console.warn(`⚠️ Resume "${persona.resume}" not found in profile folder and no resumeUrl set — sending without attachment.`);
        }

        // Send the email via Gmail Webhook Bridge (or SMTP fallback)
        await sendEmail({
          fromName: profile.name,
          to: draft.recipientEmail,
          subject: draft.subject || `${draft.jobTitle} Application — ${profile.name}`,
          body: draft.draftEmail,
          attachments: resume ? [resume] : [],
        });

        // Update draft state
        updateDraft(jobId, (d) => {
          d.status = "sent";
          d.sentAt = new Date().toISOString();
        });

        // Edit original message to remove buttons and show confirmation
        const existingText = query.message?.text || "";
        const updatedText = `${existingText}\n\n━━━━━━━━━━━━━━━━━━━━\n✅ *EMAIL SENT!*\n📬 *To:* \`${draft.recipientEmail}\`\n⏱️ *Sent at:* ${new Date().toLocaleTimeString()}`;

        await bot.editMessageText(updatedText, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔗 View Job Posting", url: draft.url },
              ],
            ],
          },
        });

        console.log(`[${new Date().toISOString().slice(11, 19)}] 🚀 Email sent to ${draft.recipientEmail} (${draft.company})`);
      } catch (err: any) {
        console.error("❌ Failed to send email via SMTP:", err);
        await bot.sendMessage(
          chatId,
          `❌ *Failed to send email to ${draft.recipientEmail}:*\n\`${err.message}\``,
          { parse_mode: "Markdown" }
        );
      }
    } else if (action === "skip") {
      updateDraft(jobId, (d) => {
        d.status = "skipped";
      });

      const existingText = query.message?.text || "";
      const updatedText = `${existingText}\n\n━━━━━━━━━━━━━━━━━━━━\n⏭️ *Dismissed*`;

      try {
        await bot.editMessageText(updatedText, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔗 View Job Posting", url: draft?.url || "https://remoteok.com" },
              ],
            ],
          },
        });
      } catch (err) {
        // Fallback
      }

      await bot.answerCallbackQuery(query.id, { text: "Job alert dismissed." });
    } else if (action === "edit") {
      if (!draft) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Draft not found.", show_alert: true });
        return;
      }

      pendingEdits.set(chatId, { jobId, promptMessageId: messageId });

      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(
        chatId,
        `✏️ *Editing Email for ${draft.company}*\n\n` +
          `Current draft:\n\`\`\`\n${draft.draftEmail}\n\`\`\`\n` +
          `👉 *Reply to this message with your updated email text.* (or send \`/cancel\` to cancel)`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Handle incoming messages for editing
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwnerChat(chatId)) return;
    const text = msg.text?.trim();

    if (!text || text.startsWith("/")) {
      if (text === "/cancel" && pendingEdits.has(chatId)) {
        pendingEdits.delete(chatId);
        await bot.sendMessage(chatId, "🚫 Edit canceled.");
      }
      return;
    }

    const pending = pendingEdits.get(chatId);
    if (!pending) return;

    const { jobId } = pending;
    pendingEdits.delete(chatId);

    const updated = updateDraft(jobId, (d) => {
      d.draftEmail = text;
    });

    if (!updated) {
      await bot.sendMessage(chatId, "❌ Failed to update draft. Cache expired.");
      return;
    }

    await bot.sendMessage(
      chatId,
      `✨ *Draft Updated for ${updated.company}!* Ready to send:\n\n\`\`\`\n${updated.draftEmail}\n\`\`\``,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✉️ Send to ${updated.recipientEmail || updated.recipientName}`, callback_data: `send:${jobId}` },
              { text: "❌ Skip", callback_data: `skip:${jobId}` },
            ],
          ],
        },
      }
    );
  });
}

// Auto-start if run directly
if (require.main === module) {
  startBotDaemon().catch((err) => {
    console.error("Fatal error starting bot daemon:", err);
    process.exit(1);
  });
}