import path from "path";
import fs from "fs";
import axios from "axios";
import { CandidateTrackKey, PersonaConfig, Profile, getProfileDir } from "../profile";

export type { CandidateTrackKey } from "../profile";

export interface CandidatePersona extends PersonaConfig {
  key: CandidateTrackKey;
  buildSubject: (jobTitle: string) => string;
}

export function getPersona(profile: Profile, key: CandidateTrackKey): CandidatePersona {
  const resolvedKey = profile.personas[key] ? key : profile.defaultPersona;
  const config = profile.personas[resolvedKey]!;

  return {
    ...config,
    key: resolvedKey,
    buildSubject: (jobTitle: string) => {
      const t = jobTitle.toLowerCase();
      const rule = (config.subjectRules || []).find((r) => r.match.some((m) => t.includes(m.toLowerCase())));
      return `${rule ? rule.subject : config.defaultSubject} — ${profile.name}`;
    },
  };
}

export function detectTrackKey(title: string, description: string): CandidateTrackKey {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  // 1. Explicit AI / Founding in title has highest priority for Track 3
  const isFoundingOrAI =
    /\b(founding|founder|applied ai|ai engineer|agentic|llm|genai|machine learning|generative ai)\b/i.test(
      titleLower
    );

  if (isFoundingOrAI) {
    return "ai_founding";
  }

  // 2. Title-specific frontend checks -> Track 1
  const isFrontendTitle =
    /\b(frontend|front-end|front end|react|ui|web developer|web engineer)\b/i.test(titleLower);
  const isFullstackTitle = /\b(full[- ]?stack|fullstack)\b/i.test(titleLower);

  if (isFrontendTitle) {
    return "fullstack";
  }

  // 3. Title-specific backend checks -> Track 2
  const isBackendTitle =
    /\b(backend|back-end|back end|systems?|platform|infrastructure|devops|database|data engineer)\b/i.test(
      titleLower
    );

  if (isBackendTitle) {
    return "backend";
  }

  if (isFullstackTitle) {
    // If it heavily mentions AI/RAG in description, route to ai_founding
    const aiMentions = (
      descLower.match(
        /\b(agentic|rag|llm|langchain|openai|gemini|anthropic|vector search|embeddings)\b/g
      ) || []
    ).length;
    if (aiMentions >= 3) {
      return "ai_founding";
    }
    return "fullstack";
  }

  // 4. Generic titles (e.g. "Software Engineer", "Software Developer", "Product Engineer")
  const aiScore = (
    descLower.match(
      /\b(agentic|rag|llm|generative ai|artificial intelligence|vector database|embeddings|prompt)\b/g
    ) || []
  ).length;
  const backendScore = (
    descLower.match(
      /\b(backend|postgres|sql|database|distributed|microservice|aws|lambda|ecs|docker|redis|api design|rest api)\b/g
    ) || []
  ).length;
  const frontendScore = (
    descLower.match(
      /\b(frontend|react|next\.?js|ui|ux|css|tailwind|html|client-side|web application)\b/g
    ) || []
  ).length;

  if (aiScore >= 3 && aiScore > backendScore && aiScore > frontendScore) {
    return "ai_founding";
  }

  if (backendScore > frontendScore) {
    return "backend";
  }

  return "fullstack";
}

export function detectCandidateTrack(profile: Profile, title: string, description: string): CandidatePersona {
  return getPersona(profile, detectTrackKey(title, description));
}

export function buildSenderSignature(profile: Profile, persona: CandidatePersona): string {
  const links = (profile.signatureLinks || []).map((l) => `${l.label}: ${l.url}`);
  return ["Best regards,", profile.name, persona.titleInSignature, ...links].join("\n");
}

/**
 * Loads the PDF resume for a persona from PROFILE_DIR, trying in order:
 * the PDF itself, a base64 copy named "<resume>.b64" (for hosts like Render
 * whose secret files only hold text), then the persona's resumeUrl.
 * Returns null when none is available.
 */
export async function loadResumeAttachment(
  persona: CandidatePersona
): Promise<{ filename: string; content: Buffer } | null> {
  const localPath = path.join(getProfileDir(), persona.resume);
  if (fs.existsSync(localPath)) {
    return { filename: persona.resume, content: fs.readFileSync(localPath) };
  }

  const base64Path = `${localPath}.b64`;
  if (fs.existsSync(base64Path)) {
    const encoded = fs.readFileSync(base64Path, "utf-8").replace(/\s+/g, "");
    return { filename: persona.resume, content: Buffer.from(encoded, "base64") };
  }

  if (persona.resumeUrl) {
    const response = await axios.get<ArrayBuffer>(persona.resumeUrl, { responseType: "arraybuffer", timeout: 15000 });
    return { filename: persona.resume, content: Buffer.from(response.data) };
  }

  return null;
}
