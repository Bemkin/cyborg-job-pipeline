import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { validateCorporateEmail } from "./utils/emailValidator";

dotenv.config();

// ─────────────────────────────────────────────
// Types & Config
// ─────────────────────────────────────────────

export interface CachedDraft {
  jobId: string;
  jobTitle: string;
  company: string;
  recipientEmail: string | null;
  recipientName: string | null;
  draftEmail: string;
  subject: string;
  url: string;
  createdAt: string;
  status?: "pending" | "sent" | "skipped";
  sentAt?: string;
  track?: string;
  resumeFilename?: string;
  resumePath?: string;
}

const DRAFTS_FILE = path.join(__dirname, "..", "drafts_cache.json");
const RESUME_FILENAME = "Bemnet Kibret - Founding Full-Stack Engineer Resume.pdf";
const RESUME_PATH = path.join(__dirname, "..", RESUME_FILENAME);

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing in .env");
  process.exit(1);
}

if (!GMAIL_USER || !GMAIL_PASS) {
  console.error("❌ GMAIL_USER or GMAIL_APP_PASSWORD is missing in .env");
  process.exit(1);
}

// ─────────────────────────────────────────────
// Drafts Storage Helpers
// ─────────────────────────────────────────────

export function loadDrafts(): Map<string, CachedDraft> {
  try {
    if (fs.existsSync(DRAFTS_FILE)) {
      const raw = fs.readFileSync(DRAFTS_FILE, "utf-8");
      const list: CachedDraft[] = JSON.parse(raw);
      return new Map(list.map((d) => [d.jobId, d]));
    }
  } catch (err) {
    console.warn("⚠️ Failed to read drafts_cache.json, initializing empty map:", err);
  }
  return new Map();
}

export function saveDraft(draft: CachedDraft): void {
  const drafts = loadDrafts();
  drafts.set(draft.jobId, draft);
  try {
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(Array.from(drafts.values()), null, 2));
  } catch (err) {
    console.error("❌ Failed to save draft:", err);
  }
}

export function updateDraft(jobId: string, updater: (d: CachedDraft) => void): CachedDraft | null {
  const drafts = loadDrafts();
  const draft = drafts.get(jobId);
  if (!draft) return null;
  updater(draft);
  drafts.set(jobId, draft);
  try {
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(Array.from(drafts.values()), null, 2));
  } catch (err) {
    console.error("❌ Failed to update draft:", err);
  }
  return draft;
}

// ─────────────────────────────────────────────
// Email Transporter
// ─────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  },
});

// ─────────────────────────────────────────────
// Bot Daemon
// ─────────────────────────────────────────────

interface PendingEdit {
  jobId: string;
  promptMessageId?: number;
}

const pendingEdits = new Map<number | string, PendingEdit>();

export async function startBotDaemon(): Promise<void> {
  console.log("══════════════════════════════════════════════════");
  console.log("  🤖 CYBORG TELEGRAM BOT DAEMON (v2.1)");
  console.log("  ✉️ Gmail SMTP One-Tap Dispatcher Active");
  console.log("══════════════════════════════════════════════════");

  // Verify SMTP
  try {
    console.log(`🔌 Testing Gmail SMTP credentials for ${GMAIL_USER}...`);
    await transporter.verify();
    console.log("✅ Gmail SMTP connection verified successfully!");
  } catch (err) {
    console.error("❌ Gmail SMTP verification failed:", err);
    console.error("   Please check your GMAIL_USER and GMAIL_APP_PASSWORD.");
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

  console.log("👂 Listening for button taps and Telegram commands...\n");

  // Command: /status
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const drafts = loadDrafts();
    const pending = Array.from(drafts.values()).filter((d) => d.status === "pending" || !d.status).length;
    const sent = Array.from(drafts.values()).filter((d) => d.status === "sent").length;

    await bot.sendMessage(
      chatId,
      `🟢 *Cyborg Bot Daemon Active*\n\n` +
        `• *Gmail Account:* \`${GMAIL_USER}\`\n` +
        `• *Pending Drafts:* ${pending}\n` +
        `• *Sent via One-Tap:* ${sent}\n\n` +
        `Tap Send on any job notification to fire off cold emails!`,
      { parse_mode: "Markdown" }
    );
  });

  // Command: /testemail
  bot.onText(/\/testemail/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(chatId, `⏳ Sending test email to ${GMAIL_USER}...`);
      const testAttachments = fs.existsSync(RESUME_PATH)
        ? [{ filename: RESUME_FILENAME, path: RESUME_PATH, contentType: "application/pdf" }]
        : [];

      await transporter.sendMail({
        from: `Bemnet Kibret <${GMAIL_USER}>`,
        to: GMAIL_USER,
        subject: "🤖 Cyborg Pipeline Test Email (with Attached Resume)",
        text: `Hey Bemnet,\n\nThis is a verification test from your Cyborg Job Pipeline. Your Gmail SMTP integration, Telegram one-tap dispatch, and PDF resume attachment are fully operational!\n\nSent at: ${new Date().toISOString()}`,
        attachments: testAttachments,
      });
      await bot.sendMessage(chatId, `✅ *Test email with attached resume delivered to ${GMAIL_USER}!* Check your inbox.`, { parse_mode: "Markdown" });
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

      try {
        await bot.answerCallbackQuery(query.id, { text: `✉️ Sending email to ${draft.recipientEmail}...` });

        // Prepare PDF attachment (persona-specific or default resume)
        const pathToAttach =
          draft.resumePath && fs.existsSync(draft.resumePath)
            ? draft.resumePath
            : RESUME_PATH;
        const filenameToAttach =
          draft.resumeFilename && draft.resumePath && fs.existsSync(draft.resumePath)
            ? draft.resumeFilename
            : RESUME_FILENAME;

        const attachments = fs.existsSync(pathToAttach)
          ? [
              {
                filename: filenameToAttach,
                path: pathToAttach,
                contentType: "application/pdf",
              },
            ]
          : [];

        // Send the email via Gmail SMTP
        await transporter.sendMail({
          from: `Bemnet Kibret <${GMAIL_USER}>`,
          to: draft.recipientEmail,
          subject: draft.subject || `${draft.jobTitle} Application — Bemnet Kibret`,
          text: draft.draftEmail,
          attachments,
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