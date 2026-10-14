// ─────────────────────────────────────────────
// Stage 1 Keyword Filter
// Override the list with "keywords" in profile.json.
// ─────────────────────────────────────────────

export const DEFAULT_KEYWORDS: string[] = [
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
  "frontend",
  "front-end",
  "front end",
  "react",
  "next.js",
  "nextjs",
  "supabase",
  "postgres",
  "software engineer",
  "solutions architect",
  "backend engineer",
  "backend",
  "back-end",
  "typescript",
  "node",
  "python",
  "developer",
  "web engineer",
  "web developer",
];

/** Returns the keywords that appear (case-insensitively) anywhere in the given texts. */
export function matchKeywords(keywords: string[], ...texts: string[]): string[] {
  const haystack = texts.join(" ").toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
}
