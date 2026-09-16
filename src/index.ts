import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { saveDraft, CachedDraft } from "./bot-daemon";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const SEEN_JOBS_PATH = path.join(__dirname, "..", "seen_jobs.json");
const REMOTEOK_API = "https://remoteok.com/api";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const RATE_LIMIT_MS = 4000; // 4s delay between Gemini calls → stays under 15 RPM
const RR_RATE_LIMIT_MS = 2000; // 2s delay between RocketReach calls

const ROCKETREACH_API_BASE = "https://api.rocketreach.co/v2/api";
const ROCKETREACH_TITLE_PRIORITIES = [
  ["Founder", "Co-Founder"],
  ["CTO", "Chief Technology Officer"],
  ["VP Engineering", "VP of Engineering"],
  ["Head of Engineering", "Engineering Director"],
  ["Recruiter", "Talent Acquisition", "Head of People"],
];

const TARGET_KEYWORDS: string[] = [
  "founding engineer",
  "agentic",
  "applied ai",
  "ai solutions",
  "ai-driven",
  "ai platform",
  "cursor",
  "claude",
  "ai-assisted",
  "high-velocity",
  "saas",
  "full-stack",
  "fullstack",
  "next.js",
  "nextjs",
  "supabase",
  "postgres",
  "software engineer",
  "solutions architect",
  "backend engineer",
];

const CANDIDATE_CONTEXT = `I am Bemnet Kibret, Lead Full-Stack Engineer & Founder at Senselet (enterprise AI-powered inventory & ERP ecosystem). I weave autonomous agentic AI into core product workflows, having architected production systems with 15+ function-calling tools, multi-model failover, and localized AI integrations. I own the entire stack from concept to production—building multi-tenant architectures from scratch with 157 PostgreSQL migrations, offline-first queues, and idempotent webhook pipelines using Next.js, TypeScript, and Supabase. Additionally, I built FormCheck AI (real-time computer vision workout assistant) and lead pipeline automation architectures.`;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface RemoteOKJob {
  slug?: string;
  id?: string;
  epoch?: number;
  date?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  logo?: string;
  description?: string;
  location?: string;
  original?: boolean;
  url?: string;
  apply_url?: string;
}

interface ProcessedJob {
  title: string;
  company: string;
  url: string;
  description: string;
  matchedKeywords: string[];
}

interface ContactInfo {
  name: string;
  title: string;
  email: string | null;
  linkedinUrl: string | null;
}

// ─────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────

function log(emoji: string, message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${emoji} ${message}`);
}

// ─────────────────────────────────────────────
// Job Fetching
// ─────────────────────────────────────────────

async function fetchJobs(): Promise<RemoteOKJob[]> {
  log("🔍", "Fetching jobs from RemoteOK...");

  try {
    const response = await axios.get<RemoteOKJob[]>(REMOTEOK_API, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CyborgJobPipeline/2.0",
      },
      timeout: 15000,
    });

    // RemoteOK API returns an array where the first element is metadata (legal notice)
    const jobs = response.data.filter(
      (item: RemoteOKJob) => item.position && item.company
    );

    log("✅", `Fetched ${jobs.length} job listings from RemoteOK`);
    return jobs;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      log("❌", `Network error fetching RemoteOK: ${error.message}`);
    } else {
      log("❌", `Unexpected error fetching jobs: ${error}`);
    }
    return [];
  }
}

// ─────────────────────────────────────────────
// Stage 1: Local Keyword Filter
// ─────────────────────────────────────────────

function extractTextFromHtml(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

function localFilter(jobs: RemoteOKJob[]): ProcessedJob[] {
  log("🔎", `Running Stage 1 local keyword filter on ${jobs.length} jobs...`);

  const matched: ProcessedJob[] = [];

  for (const job of jobs) {
    const position = (job.position || "").toLowerCase();
    const description = extractTextFromHtml(job.description || "");
    const descLower = description.toLowerCase();
    const tagsStr = (job.tags || []).join(" ").toLowerCase();

    const searchText = `${position} ${descLower} ${tagsStr}`;

    const matchedKeywords = TARGET_KEYWORDS.filter((kw) =>
      searchText.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      let rawUrl =
        job.url ||
        job.apply_url ||
        `https://remoteok.com/remote-jobs/${job.slug || job.id || ""}`;

      // Normalize domain to lowercase https://remoteok.com/ to prevent any redirect quirks
      const jobUrl = rawUrl.replace(/^https?:\/\/remoteok\.com/i, "https://remoteok.com");

      matched.push({
        title: job.position || "Unknown Position",
        company: job.company || "Unknown Company",
        url: jobUrl,
        description: description.slice(0, 3000), // Cap description length for API calls
        matchedKeywords,
      });
    }
  }

  log("✅", `Stage 1: ${matched.length} jobs matched local keywords`);
  return matched;
}

// ─────────────────────────────────────────────
// Deduplication
// ─────────────────────────────────────────────

function loadSeenJobs(): Set<string> {
  try {
    if (fs.existsSync(SEEN_JOBS_PATH)) {
      const data = fs.readFileSync(SEEN_JOBS_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch (error) {
    log("⚠️", `Could not parse seen_jobs.json, resetting to empty: ${error}`);
  }
  return new Set();
}

function saveSeenJobs(seen: Set<string>): void {
  try {
    fs.writeFileSync(SEEN_JOBS_PATH, JSON.stringify([...seen], null, 2));
    log("💾", `Saved ${seen.size} seen job URLs to disk`);
  } catch (error) {
    log("❌", `Failed to save seen_jobs.json: ${error}`);
  }
}

function deduplicateJobs(
  jobs: ProcessedJob[],
  seen: Set<string>
): ProcessedJob[] {
  const newJobs = jobs.filter((job) => !seen.has(job.url));
  const skipped = jobs.length - newJobs.length;
  if (skipped > 0) {
    log("⚠️", `Skipped ${skipped} already-seen jobs`);
  }
  log("✅", `${newJobs.length} new jobs to process`);
  return newJobs;
}

// ─────────────────────────────────────────────
// RocketReach Contact Enrichment
// ─────────────────────────────────────────────

async function findContact(companyName: string): Promise<ContactInfo | null> {
  const rrApiKey = process.env.ROCKETREACH_API_KEY;
  if (!rrApiKey) {
    log("⚠️", "ROCKETREACH_API_KEY not set, skipping contact enrichment");
    return null;
  }

  // Try each title priority group until we find someone
  for (const titleGroup of ROCKETREACH_TITLE_PRIORITIES) {
    try {
      const response = await axios.post(
        `${ROCKETREACH_API_BASE}/search`,
        {
          query: {
            current_employer: [companyName],
            current_title: titleGroup,
          },
          start: 1,
          page_size: 1,
        },
        {
          headers: {
            "Api-Key": rrApiKey,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      const profiles = response.data?.profiles;
      if (profiles && profiles.length > 0) {
        const person = profiles[0];
        const contact: ContactInfo = {
          name: person.name || `${person.first_name || ""} ${person.last_name || ""}`.trim(),
          title: person.current_title || titleGroup[0],
          email: null,
          linkedinUrl: person.linkedin_url || null,
        };

        // Extract verified email with '@' (ignore teaser domain strings)
        let verifiedEmail: string | null = null;
        if (Array.isArray(person.emails)) {
          for (const e of person.emails) {
            const addr = typeof e === "string" ? e : e?.email;
            if (addr && addr.includes("@")) {
              verifiedEmail = addr;
              break;
            }
          }
        }

        // If no verified email in search results, do a full profile lookup
        if (!verifiedEmail && person.id) {
          log("🔎", `Looking up full contact details for ${contact.name}...`);
          verifiedEmail = await lookupContactEmail(person.id, rrApiKey);
        }

        contact.email = verifiedEmail && verifiedEmail.includes("@") ? verifiedEmail : null;

        log("🎯", `Found contact: ${contact.name} (${contact.title}) at ${companyName}`);
        if (contact.email) {
          log("📧", `Email: ${contact.email}`);
        }
        return contact;
      }

      await delay(RR_RATE_LIMIT_MS);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // 429 = rate limit, 403 = credits exhausted
        if (error.response?.status === 429) {
          log("⚠️", `RocketReach rate limited, retrying in 5s...`);
          await delay(5000);
          continue;
        }
        if (error.response?.status === 403) {
          log("⚠️", `RocketReach credits exhausted, skipping enrichment`);
          return null;
        }
        log("⚠️", `RocketReach search error (${error.response?.status}): ${error.message}`);
      } else {
        log("⚠️", `RocketReach unexpected error: ${error}`);
      }
      return null;
    }
  }

  log("⚠️", `No contact found at ${companyName}`);
  return null;
}

async function lookupContactEmail(profileId: number, apiKey: string): Promise<string | null> {
  try {
    const response = await axios.get(`${ROCKETREACH_API_BASE}/lookupProfile`, {
      params: { id: profileId },
      headers: { "Api-Key": apiKey },
      timeout: 10000,
    });

    const status = response.data?.status;

    // If lookup is still processing, poll up to 3 times
    if (status === "searching" || status === "incomplete") {
      for (let attempt = 0; attempt < 3; attempt++) {
        await delay(3000);
        const pollResponse = await axios.get(`${ROCKETREACH_API_BASE}/lookupProfile`, {
          params: { id: profileId },
          headers: { "Api-Key": apiKey },
          timeout: 10000,
        });

        if (pollResponse.data?.status === "complete") {
          const emails = pollResponse.data?.emails;
          if (emails?.length > 0) {
            const validWork = emails.find((e: any) => e.smtp_valid === "valid" && e.type === "professional");
            if (validWork?.email && validWork.email.includes("@")) return validWork.email;
            const valid = emails.find((e: any) => e.smtp_valid === "valid");
            if (valid?.email && valid.email.includes("@")) return valid.email;
            const fallback = emails[0].email || emails[0];
            return typeof fallback === "string" && fallback.includes("@") ? fallback : null;
          }
          return null;
        }
      }
      log("⚠️", `RocketReach lookup still processing after 3 polls, skipping`);
      return null;
    }

    // Lookup complete
    const emails = response.data?.emails;
    if (emails?.length > 0) {
      const validWork = emails.find((e: any) => e.smtp_valid === "valid" && e.type === "professional");
      if (validWork?.email && validWork.email.includes("@")) return validWork.email;
      const valid = emails.find((e: any) => e.smtp_valid === "valid");
      if (valid?.email && valid.email.includes("@")) return valid.email;
      const fallback = emails[0].email || emails[0];
      return typeof fallback === "string" && fallback.includes("@") ? fallback : null;
    }

    return null;
  } catch (error) {
    log("⚠️", `RocketReach lookup error: ${error}`);
    return null;
  }
}

// ─────────────────────────────────────────────
// Stage 2: AI Analysis & Email Drafting
// ─────────────────────────────────────────────

function buildPrompt(title: string, description: string, contact: ContactInfo | null): string {
  const recipientContext = contact
    ? `Address the email directly to ${contact.name} (${contact.title}). Use their first name naturally.`
    : `Address the email to "Hiring Team" since no specific contact was found.`;

  return `You are an expert technical recruiter and cold email copywriter. Analyze this job description against my profile.

If the job is a poor fit or a standard corporate role that wouldn't value high-velocity AI-assisted development, output exactly the word "SKIP" and nothing else.

If it is a good fit, write a concise 3-sentence cold email pitching me for the role. Be specific to their exact needs. No fluff. No subject line. Just the email body.

${recipientContext}

Job Title: ${title}

Job Description:
${description}

Candidate Context:
${CANDIDATE_CONTEXT}`;
}

export const SENDER_SIGNATURE = `Best regards,
Bemnet Kibret
Lead Full-Stack & AI Engineer | Founder, Senselet
GitHub: https://github.com/Bemkin
LinkedIn: https://www.linkedin.com/in/bemnet-kibret-054a792a9/
Portfolio: https://my-portfolio-theta-flame-45.vercel.app
Live CV: https://my-portfolio-theta-flame-45.vercel.app/resume`;

async function analyzeAndDraft(
  job: ProcessedJob,
  genAI: GoogleGenerativeAI,
  contact: ContactInfo | null
): Promise<string | null> {
  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300,
      },
    });

    const prompt = buildPrompt(job.title, job.description, contact);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    if (text.toUpperCase() === "SKIP" || text.toUpperCase().startsWith("SKIP")) {
      log("🤖", `AI skipped: "${job.title}" at ${job.company} (poor fit)`);
      return null;
    }

    // Clean up any trailing sign-offs before appending the canonical signature
    const cleanedText = text
      .replace(/(Best regards|Best|Sincerely|Regards),?\s*(Bemnet|Bemnet Kibret)?\s*$/i, "")
      .trim();

    const fullEmail = `${cleanedText}\n\n${SENDER_SIGNATURE}`;

    log("🤖", `AI drafted email for: "${job.title}" at ${job.company}`);
    return fullEmail;
  } catch (error) {
    log("❌", `Gemini API error for "${job.title}": ${error}`);
    return null;
  }
}

// ─────────────────────────────────────────────
// Rate Limiter
// ─────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// Telegram Delivery
// ─────────────────────────────────────────────

function formatTelegramMessage(
  job: ProcessedJob,
  draftEmail: string,
  contact: ContactInfo | null
): string {
  const keywordsStr = job.matchedKeywords
    .map((kw) => kw.charAt(0).toUpperCase() + kw.slice(1))
    .join(", ");

  const lines: string[] = [
    `🏢 *${escapeMarkdown(job.title)} — ${escapeMarkdown(job.company)}*`,
    ``,
    `🔗 [Apply Here](${job.url})`,
    ``,
    `🔑 *Matched Keywords:* ${escapeMarkdown(keywordsStr)}`,
  ];

  // Add contact info if found
  if (contact) {
    lines.push(``);
    lines.push(`👤 *Decision Maker:*`);
    lines.push(`   Name: ${escapeMarkdown(contact.name)}`);
    lines.push(`   Title: ${escapeMarkdown(contact.title)}`);
    if (contact.email) {
      lines.push(`   Email: ${escapeMarkdown(contact.email)}`);
    }
    if (contact.linkedinUrl) {
      lines.push(`   [LinkedIn Profile](${contact.linkedinUrl})`);
    }
  }

  lines.push(``);
  lines.push(`✉️ *Personalized Draft Email:*`);
  lines.push(escapeMarkdown(draftEmail));

  return lines.join("\n");
}

function escapeMarkdown(text: string): string {
  // Escape special markdown characters for Telegram MarkdownV2
  // But preserve intentional formatting
  return text.replace(/([_\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

async function sendToTelegram(
  bot: TelegramBot,
  chatId: string,
  message: string,
  inlineKeyboard?: TelegramBot.InlineKeyboardButton[][]
): Promise<void> {
  const replyMarkup = inlineKeyboard && inlineKeyboard.length > 0
    ? { inline_keyboard: inlineKeyboard }
    : undefined;

  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: "MarkdownV2",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
    log("📬", "Message sent to Telegram (with action buttons)");
  } catch (error) {
    // Fall back to plain text if markdown parsing fails
    log("⚠️", `MarkdownV2 failed, retrying as plain text: ${error}`);
    try {
      const plainMessage = message.replace(/\\([_\[\]()~`>#+\-=|{}.!\\])/g, "$1");
      await bot.sendMessage(chatId, plainMessage, {
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      });
      log("📬", "Message sent to Telegram (plain text fallback with buttons)");
    } catch (fallbackError) {
      log("❌", `Telegram delivery failed completely: ${fallbackError}`);
    }
  }
}

// ─────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log("  🤖 CYBORG JOB SOURCING PIPELINE v2.0");
  console.log("  📇 RocketReach Contact Enrichment Enabled");
  console.log("═".repeat(60));

  if (DRY_RUN) {
    log("🏃", "DRY RUN MODE — No API calls or Telegram messages will be sent");
  }

  // ── Validate env vars (skip in dry-run) ──
  const geminiKey = process.env.GEMINI_API_KEY;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const rrApiKey = process.env.ROCKETREACH_API_KEY;

  if (!DRY_RUN) {
    if (!geminiKey) {
      log("❌", "GEMINI_API_KEY is not set in .env");
      process.exit(1);
    }
    if (!telegramToken) {
      log("❌", "TELEGRAM_BOT_TOKEN is not set in .env");
      process.exit(1);
    }
    if (!telegramChatId) {
      log("❌", "TELEGRAM_CHAT_ID is not set in .env");
      process.exit(1);
    }
    if (!rrApiKey) {
      log("⚠️", "ROCKETREACH_API_KEY not set — contact enrichment will be skipped");
    }
  }

  // ── Step 1: Fetch jobs ──
  const rawJobs = await fetchJobs();
  if (rawJobs.length === 0) {
    log("⚠️", "No jobs fetched. Exiting gracefully.");
    return;
  }

  // ── Step 2: Stage 1 local keyword filter ──
  const filteredJobs = localFilter(rawJobs);
  if (filteredJobs.length === 0) {
    log("⚠️", "No jobs matched target keywords. Exiting.");
    return;
  }

  // ── Step 3: Deduplication ──
  const seenJobs = loadSeenJobs();
  const newJobs = deduplicateJobs(filteredJobs, seenJobs);
  if (newJobs.length === 0) {
    log("⚠️", "All matching jobs already seen. Nothing to do.");
    return;
  }

  // ── Dry-run output ──
  if (DRY_RUN) {
    console.log("\n" + "─".repeat(60));
    log("📋", `DRY RUN: ${newJobs.length} jobs would be processed:\n`);
    for (const job of newJobs) {
      console.log(`  🏢 ${job.title} — ${job.company}`);
      console.log(`  🔗 ${job.url}`);
      console.log(`  🔑 Keywords: ${job.matchedKeywords.join(", ")}`);
      console.log(`  📝 Description preview: ${job.description.slice(0, 150)}...`);
      console.log("");
    }
    console.log("─".repeat(60));
    log("🏁", "Dry run complete. No API calls were made.");
    return;
  }

  // ── Step 4: Initialize clients ──
  const genAI = new GoogleGenerativeAI(geminiKey!);
  const bot = new TelegramBot(telegramToken!, { polling: false });

  // ── Step 5: Process each job (RocketReach → AI analysis → Telegram) ──
  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let enrichedCount = 0;

  console.log("\n" + "─".repeat(60));
  log("🧠", `Starting Stage 2 processing on ${newJobs.length} jobs...\n`);

  for (let i = 0; i < newJobs.length; i++) {
    const job = newJobs[i];
    log("📌", `[${i + 1}/${newJobs.length}] Processing: "${job.title}" at ${job.company}`);

    // Step 5a: RocketReach contact lookup
    let contact: ContactInfo | null = null;
    if (rrApiKey) {
      log("🔎", `Searching RocketReach for decision-maker at ${job.company}...`);
      contact = await findContact(job.company);
      if (contact) {
        enrichedCount++;
      }
      await delay(RR_RATE_LIMIT_MS);
    }

    // Step 5b: AI analysis & personalized draft
    const draftEmail = await analyzeAndDraft(job, genAI, contact);

    // Mark as seen regardless of outcome
    seenJobs.add(job.url);

    if (draftEmail === null) {
      skippedCount++;
    } else {
      // Generate unique jobId for callback buttons
      const jobId = crypto.createHash("md5").update(job.url).digest("hex").slice(0, 8);

      // Save draft to local cache for one-tap sending
      const draftRecord: CachedDraft = {
        jobId,
        jobTitle: job.title,
        company: job.company,
        recipientEmail: contact?.email || null,
        recipientName: contact?.name || null,
        draftEmail,
        subject: `Founding Engineer / ${job.title} — Bemnet Kibret`,
        url: job.url,
        createdAt: new Date().toISOString(),
        status: "pending",
      };
      saveDraft(draftRecord);

      // Build inline action keyboard
      const inlineKeyboard: TelegramBot.InlineKeyboardButton[][] = [];
      if (contact?.email) {
        inlineKeyboard.push([
          { text: "✉️ Send Email", callback_data: `send:${jobId}` },
          { text: "✏️ Edit Draft", callback_data: `edit:${jobId}` },
          { text: "❌ Skip", callback_data: `skip:${jobId}` },
        ]);
      } else {
        inlineKeyboard.push([
          { text: "🔗 View & Apply", url: job.url },
          { text: "❌ Dismiss", callback_data: `skip:${jobId}` },
        ]);
      }

      // Step 5c: Send to Telegram with contact info and buttons
      const message = formatTelegramMessage(job, draftEmail, contact);
      await sendToTelegram(bot, telegramChatId!, message, inlineKeyboard);
      sentCount++;
    }

    // Rate limit: wait between iterations (skip on last)
    if (i < newJobs.length - 1) {
      log("⏳", `Rate limit pause (${RATE_LIMIT_MS / 1000}s)...`);
      await delay(RATE_LIMIT_MS);
    }
  }

  // ── Step 6: Save state & report ──
  saveSeenJobs(seenJobs);

  console.log("\n" + "═".repeat(60));
  log("🏁", "Pipeline complete!");
  console.log(`     📬 Sent to Telegram: ${sentCount}`);
  console.log(`     📇 Contacts enriched: ${enrichedCount}`);
  console.log(`     🤖 AI-skipped (poor fit): ${skippedCount}`);
  console.log(`     ❌ Errors: ${errorCount}`);
  console.log("═".repeat(60) + "\n");
}

// ─────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────

main().catch((error) => {
  log("💀", `Fatal unhandled error: ${error}`);
  process.exit(1);
});
