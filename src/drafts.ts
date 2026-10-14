import fs from "fs";
import path from "path";
import axios from "axios";

// ─────────────────────────────────────────────
// Drafts Storage
// Shared by the pipeline (writes drafts) and the bot daemon (sends them).
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
}

const DRAFTS_FILE = path.join(__dirname, "..", "drafts_cache.json");

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

export function writeDrafts(drafts: Map<string, CachedDraft>): void {
  fs.writeFileSync(DRAFTS_FILE, JSON.stringify(Array.from(drafts.values()), null, 2));
}

export async function syncDraftToCloud(
  baseUrl: string,
  drafts: CachedDraft | CachedDraft[]
): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/draft`;
    const secret = process.env.SYNC_SECRET;
    await axios.post(url, drafts, {
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-sync-secret": secret } : {}),
      },
      timeout: 8000,
    });
    return true;
  } catch (err: any) {
    console.warn(`⚠️ Cloud draft sync notice: ${err.message}`);
    return false;
  }
}

export function saveDraft(draft: CachedDraft): void {
  const drafts = loadDrafts();
  drafts.set(draft.jobId, draft);
  try {
    writeDrafts(drafts);
  } catch (err) {
    console.error("❌ Failed to save draft:", err);
  }

  // If RENDER_DAEMON_URL is configured and we're not running inside Render, sync asynchronously
  const cloudUrl = process.env.RENDER_DAEMON_URL || process.env.BOT_DAEMON_URL;
  if (cloudUrl && !process.env.IS_RENDER_DAEMON) {
    syncDraftToCloud(cloudUrl, draft).catch(() => {});
  }
}

export function updateDraft(jobId: string, updater: (d: CachedDraft) => void): CachedDraft | null {
  const drafts = loadDrafts();
  const draft = drafts.get(jobId);
  if (!draft) return null;
  updater(draft);
  drafts.set(jobId, draft);
  try {
    writeDrafts(drafts);
  } catch (err) {
    console.error("❌ Failed to update draft:", err);
  }
  return draft;
}
