import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { saveDraft, CachedDraft } from "./bot-daemon";
import { scrapeLinkedInRecommendedJobs } from "./scrapers/linkedin";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const LINKEDIN_ONLY = process.argv.includes("--linkedin-only");
const REMOTEOK_ONLY = process.argv.includes("--remoteok-only");
const FORCE_LOGIN = process.argv.includes("--login");

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

// ─────────────────────────────────────────────
// Candidate Context (Directly from Resume)
// ─────────────────────────────────────────────

const CANDIDATE_CONTEXT = `I am Bemnet Kibret, a high-agency Founding Full-Stack & AI Engineer specializing in taking complex, data-intensive platforms from zero to production.

Key Highlights & Track Record:
• Founder & Lead Engineer at Senselet: Architected and deployed an AI-native enterprise ERP from the ground up on AWS and Supabase, scaling across 3+ commercial retail clients to eliminate 20+ hours of weekly manual auditing across 10k+ active SKUs.
• High-Stakes Decisioning & Agentic AI: Engineered a proprietary 15-tool agentic backend using native JSON-schema function calling and cascading LLM failover; automated 90%+ of routine reorder and financial allocation decisions, cutting turnaround from 45 min to <30 sec.
• Mission-Critical Data Integrity: Designed an offline-first architecture utilizing a Dual-ID resolution layer via PostgreSQL; authored 157 strict migrations with org-scoped RLS to guarantee 0% data loss across 5+ warehouse locations.
• Real-Time Cloud Pipelines: Built containerized Python and Node.js microservices on AWS (ECS/Lambda) with idempotent webhook handlers (sub-500ms execution latency, 99.9% deduplication reliability).
• Backend Developer at Marvels Creative Technology: Architected & optimized 20+ RESTful API endpoints and server routes (TypeScript, Next.js), reducing response times by ~35%. Designed PostgreSQL schemas with Prisma ORM (sub-100ms latency), automated CI/CD API test suites with Jest.
• AI Cockpit & Data Pipelines: Built AGY Telegram Bot (autonomous coding agent command center with Playwright visual checkpoints, streaming response, Cloudflare tunneling) and an Automated Data Enrichment RAG pipeline (5,000+ records, semantic search indexing, 99.2% extraction accuracy).

Core Tech Stack:
TypeScript, Next.js, React, Node.js, Python, PostgreSQL, Supabase (RLS, Edge Functions), AWS (ECS, Lambda), Docker, RAG, Vector Embeddings, Semantic Search, Function Calling, Cursor, Claude.`;

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

export interface ProcessedJob {
  title: string;
  company: string;
  url: string;
  description: string;
  matchedKeywords: string[];
  source?: "RemoteOK" | "LinkedIn";
  isTopApplicant?: boolean;
  contact?: ContactInfo | null;
}

export interface ContactInfo {
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
// Job Fetching: RemoteOK
// ─────────────────────────────────────────────

async function fetchRemoteOKJobs(): Promise<RemoteOKJob[]> {
  log("🔍", "Fetching jobs from RemoteOK...");

  try {
    const response = await axios.get<RemoteOKJob[]>(REMOTEOK_API, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CyborgJobPipeline/2.0",
      },
      timeout: 15000,
    });

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

      const jobUrl = rawUrl.replace(/^https?:\/\/remoteok\.com/i, "https://remoteok.com");

      matched.push({
        title: job.position || "Unknown Position",
        company: job.company || "Unknown Company",
        url: jobUrl,
        description: description.slice(0, 3000),
        matchedKeywords,
        source: "RemoteOK",
        isTopApplicant: false,
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

async function findContact(
  companyName: string,
  preferredContact?: ContactInfo | null
): Promise<ContactInfo | null> {
  const rrApiKey = process.env.ROCKETREACH_API_KEY;

  // 1. Direct hiring team member lookup (from LinkedIn "Meet the hiring team")
  if (preferredContact && preferredContact.name) {
    log("🎯", `Targeting direct hiring team member: ${preferredContact.name} (${preferredContact.title}) at ${companyName}`);
    if (!rrApiKey) {
      return preferredContact;
    }

    try {
      log("🔎", `Querying RocketReach for verified email of ${preferredContact.name}...`);
      const response = await axios.post(
        `${ROCKETREACH_API_BASE}/search`,
        {
          query: {
            current_employer: [companyName],
            name: preferredContact.name,
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

        if (!verifiedEmail && person.id) {
          log("🔎", `Looking up full contact details for ${preferredContact.name}...`);
          verifiedEmail = await lookupContactEmail(person.id, rrApiKey);
        }

        const enriched: ContactInfo = {
          name: preferredContact.name,
          title: preferredContact.title || person.current_title || "Job Poster",
          email: verifiedEmail && verifiedEmail.includes("@") ? verifiedEmail : null,
          linkedinUrl: preferredContact.linkedinUrl || person.linkedin_url || null,
        };

        log("🎯", `Found email for hiring team member: ${enriched.name} (${enriched.title})`);
        if (enriched.email) {
          log("📧", `Email: ${enriched.email}`);
        }
        return enriched;
      }
    } catch (err) {
      log("⚠️", `Direct RocketReach search for ${preferredContact.name} error: ${err}`);
    }

    return preferredContact;
  }

  // 2. Fallback title group search
  if (!rrApiKey) {
    log("⚠️", "ROCKETREACH_API_KEY not set, skipping contact enrichment");
    return null;
  }

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

function buildPrompt(
  title: string,
  description: string,
  contact: ContactInfo | null,
  isTopApplicant?: boolean
): string {
  const recipientContext = contact
    ? `Address the email directly to ${contact.name} (${contact.title}). Use their first name naturally.`
    : `Address the email to "Hiring Team" since no specific contact was found.`;

  const topApplicantDirective = isTopApplicant
    ? `\nNOTE: LinkedIn's qualification matching explicitly identified me as a TOP APPLICANT for this role based on my exact resume and skill profile. Write with high-confidence, founder-level authority highlighting the exact architectural synergies.\n`
    : "";

  return `You are an expert technical recruiter and cold email copywriter. Analyze this job description against my profile.

CRITICAL HARD FILTER — 100% REMOTE ONLY:
The candidate is based in Addis Ababa, Ethiopia (+251) and works entirely remotely.
If this job requires being physically on-site, in-person, in-office (e.g. London, New York City, San Francisco, Bengaluru) or is a hybrid role requiring physical office days, output exactly the word "SKIP" and nothing else.
Only accept roles that are 100% remote, remote-first, or open to international/global remote contractors.

If the job is a poor fit or a standard corporate role that wouldn't value high-velocity AI-assisted development, output exactly the word "SKIP" and nothing else.

If it is a good fit and fully remote, write a concise 3-sentence cold email pitching me for the role. Be specific to their exact needs, referencing specific accomplishments from my background (e.g. agentic workflows, scalable Next.js/Supabase infra, 157 PostgreSQL migrations, or real-time pipelines). No fluff. No subject line. Just the email body.
${topApplicantDirective}
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

    const prompt = buildPrompt(job.title, job.description, contact, job.isTopApplicant);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    if (text.toUpperCase() === "SKIP" || text.toUpperCase().startsWith("SKIP")) {
      log("🤖", `AI skipped: "${job.title}" at ${job.company} (poor fit)`);
      return null;
    }

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

  const sourceBadge = job.source ? ` \\[${escapeMarkdown(job.source)}\\]` : "";
  const topApplicantBanner = job.isTopApplicant
    ? `🌟 *TOP APPLICANT MATCH \\(LinkedIn Verified\\)*\n`
    : "";

  const lines: string[] = [
    topApplicantBanner + `🏢 *${escapeMarkdown(job.title)} — ${escapeMarkdown(job.company)}*${sourceBadge}`,
    ``,
    `🔗 [View & Apply Here](${job.url})`,
    ``,
    `🔑 *Matched Keywords:* ${escapeMarkdown(keywordsStr)}`,
  ];

  if (contact) {
    const roleLabel = job.source === "LinkedIn" ? "Hiring Team Member" : "Decision Maker";
    lines.push(``);
    lines.push(`👤 *${roleLabel}:*`);
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
  lines.push(`✉️ *Personalized Draft Email / Message:*`);
  lines.push(escapeMarkdown(draftEmail));

  return lines.join("\n");
}

function escapeMarkdown(text: string): string {
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
  console.log("  🤖 CYBORG JOB SOURCING PIPELINE v2.2");
  console.log("  💼 Multi-Source: RemoteOK + LinkedIn Recommended");
  console.log("  🌟 Top Applicant & Direct Hiring Team Matching");
  console.log("═".repeat(60));

  if (DRY_RUN) {
    log("🏃", "DRY RUN MODE — No external emails or Telegram messages will be sent");
  }

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
      log("⚠️", "ROCKETREACH_API_KEY not set — contact email enrichment will be skipped");
    }
  }

  const allCandidateJobs: ProcessedJob[] = [];

  // ── Step 1a: Fetch RemoteOK Jobs ──
  if (!LINKEDIN_ONLY) {
    const rawJobs = await fetchRemoteOKJobs();
    if (rawJobs.length > 0) {
      const filtered = localFilter(rawJobs);
      allCandidateJobs.push(...filtered);
    }
  }

  // ── Step 1b: Fetch LinkedIn Recommended & Top Applicant Jobs ──
  if (!REMOTEOK_ONLY) {
    const sessionExists =
      Boolean(process.env.LINKEDIN_LI_AT) ||
      fs.existsSync(path.join(__dirname, "..", ".linkedin-session", "storageState.json"));

    if (sessionExists || FORCE_LOGIN || LINKEDIN_ONLY) {
      log("💼", "Fetching recommended & top applicant jobs from LinkedIn...");
      try {
        const linkedinJobs = await scrapeLinkedInRecommendedJobs(20, FORCE_LOGIN);
        for (const lj of linkedinJobs) {
          const descLower = lj.description.toLowerCase();
          const titleLower = lj.title.toLowerCase();
          const matchedKeywords = TARGET_KEYWORDS.filter(
            (kw) => descLower.includes(kw.toLowerCase()) || titleLower.includes(kw.toLowerCase())
          );

          allCandidateJobs.push({
            title: lj.title,
            company: lj.company,
            url: lj.url,
            description: lj.description,
            matchedKeywords:
              matchedKeywords.length > 0
                ? matchedKeywords
                : lj.isTopApplicant
                ? ["Top Applicant", "Full-Stack"]
                : ["LinkedIn Recommended"],
            source: "LinkedIn",
            isTopApplicant: lj.isTopApplicant,
            contact: lj.jobPoster
              ? {
                  name: lj.jobPoster.name,
                  title: lj.jobPoster.title,
                  email: null,
                  linkedinUrl: lj.jobPoster.profileUrl || null,
                }
              : null,
          });
        }
      } catch (err) {
        log("⚠️", `LinkedIn scraping failed: ${err}`);
      }
    } else {
      log("ℹ️", "LinkedIn session not active yet. Run 'npm run login:linkedin' to enable LinkedIn recommended jobs.");
    }
  }

  if (allCandidateJobs.length === 0) {
    log("⚠️", "No new candidate jobs collected across sources. Exiting.");
    return;
  }

  // ── Step 2: Deduplication ──
  const seenJobs = loadSeenJobs();
  const newJobs = deduplicateJobs(allCandidateJobs, seenJobs);
  if (newJobs.length === 0) {
    log("⚠️", "All collected jobs have already been processed previously. Nothing to do.");
    return;
  }

  // Sort jobs: Prioritize Top Applicant matches at the top of the queue
  newJobs.sort((a, b) => (b.isTopApplicant ? 1 : 0) - (a.isTopApplicant ? 1 : 0));

  // ── Dry-run output ──
  if (DRY_RUN) {
    console.log("\n" + "─".repeat(60));
    log("📋", `DRY RUN: ${newJobs.length} jobs would be processed (Top Applicants prioritized):\n`);
    for (const job of newJobs) {
      const topBadge = job.isTopApplicant ? " 🌟 [TOP APPLICANT]" : "";
      const src = job.source ? ` [${job.source}]` : "";
      console.log(`  🏢 ${job.title} — ${job.company}${src}${topBadge}`);
      console.log(`  🔗 ${job.url}`);
      console.log(`  🔑 Keywords: ${job.matchedKeywords.join(", ")}`);
      if (job.contact) {
        console.log(`  👤 Hiring Team: ${job.contact.name} (${job.contact.title})`);
      }
      console.log(`  📝 Description: ${job.description.slice(0, 140)}...`);
      console.log("");
    }
    console.log("─".repeat(60));
    log("🏁", "Dry run complete. No external calls or Telegram messages were sent.");
    return;
  }

  // ── Step 3: Initialize clients ──
  const genAI = new GoogleGenerativeAI(geminiKey!);
  const bot = new TelegramBot(telegramToken!, { polling: false });

  // ── Step 4: Process each job (Contact enrichment → AI analysis → Telegram) ──
  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let enrichedCount = 0;
  let topApplicantSentCount = 0;

  console.log("\n" + "─".repeat(60));
  log("🧠", `Starting Stage 2 processing on ${newJobs.length} jobs...\n`);

  for (let i = 0; i < newJobs.length; i++) {
    const job = newJobs[i];
    const topBadge = job.isTopApplicant ? " 🌟 [TOP APPLICANT]" : "";
    const srcTag = job.source ? ` (${job.source})` : "";
    log("📌", `[${i + 1}/${newJobs.length}] Processing: "${job.title}" at ${job.company}${srcTag}${topBadge}`);

    // Step 4a: Contact enrichment (Direct hiring team or RocketReach)
    let contact: ContactInfo | null = null;
    if (rrApiKey || job.contact) {
      contact = await findContact(job.company, job.contact);
      if (contact) {
        enrichedCount++;
      }
      await delay(RR_RATE_LIMIT_MS);
    }

    // Step 4b: AI analysis & personalized draft
    const draftEmail = await analyzeAndDraft(job, genAI, contact);

    // Mark as seen regardless of outcome
    seenJobs.add(job.url);

    if (draftEmail === null) {
      skippedCount++;
    } else {
      const jobId = crypto.createHash("md5").update(job.url).digest("hex").slice(0, 8);

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
      } else if (contact?.linkedinUrl) {
        inlineKeyboard.push([
          { text: "💬 Message on LinkedIn", url: contact.linkedinUrl },
          { text: "🔗 View Job", url: job.url },
        ]);
        inlineKeyboard.push([
          { text: "❌ Dismiss", callback_data: `skip:${jobId}` },
        ]);
      } else {
        inlineKeyboard.push([
          { text: "🔗 View & Apply", url: job.url },
          { text: "❌ Dismiss", callback_data: `skip:${jobId}` },
        ]);
      }

      // Step 4c: Send to Telegram
      const message = formatTelegramMessage(job, draftEmail, contact);
      await sendToTelegram(bot, telegramChatId!, message, inlineKeyboard);
      sentCount++;
      if (job.isTopApplicant) topApplicantSentCount++;
    }

    // Rate limit
    if (i < newJobs.length - 1) {
      log("⏳", `Rate limit pause (${RATE_LIMIT_MS / 1000}s)...`);
      await delay(RATE_LIMIT_MS);
    }
  }

  // ── Step 5: Save state & report ──
  saveSeenJobs(seenJobs);

  console.log("\n" + "═".repeat(60));
  log("🏁", "Pipeline complete!");
  console.log(`     📬 Sent to Telegram: ${sentCount} (${topApplicantSentCount} Top Applicant matches)`);
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
