import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────
// Candidate Profile
// Everything personal (name, pitch context, signature, resumes) lives in
// PROFILE_DIR/profile.json so the code itself stays generic.
// See examples/profile/ for a template.
// ─────────────────────────────────────────────

export type CandidateTrackKey = "fullstack" | "backend" | "ai_founding";

export const TRACK_KEYS: CandidateTrackKey[] = ["fullstack", "backend", "ai_founding"];

export interface SubjectRule {
  /** Lowercase substrings matched against the job title */
  match: string[];
  subject: string;
}

export interface PersonaConfig {
  displayName: string;
  badgeName: string;
  titleInSignature: string;
  /** PDF filename inside PROFILE_DIR */
  resume: string;
  /** Optional public URL used when the PDF isn't on disk (e.g. on Render) */
  resumeUrl?: string;
  context: string;
  pitchGuidance: string;
  subjectRules?: SubjectRule[];
  defaultSubject: string;
}

export interface SignatureLink {
  label: string;
  url: string;
}

export interface Profile {
  name: string;
  location: string;
  /** When true, the AI skips on-site, hybrid and residency-restricted roles */
  remoteOnly?: boolean;
  signatureLinks?: SignatureLink[];
  /** Overrides the default job keyword list used by the Stage 1 filter */
  keywords?: string[];
  defaultPersona: CandidateTrackKey;
  personas: Partial<Record<CandidateTrackKey, PersonaConfig>>;
}

export function getProfileDir(): string {
  return path.resolve(process.env.PROFILE_DIR || path.join(__dirname, "..", "profile"));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function parseProfile(raw: unknown): Profile {
  const errors: string[] = [];
  const p = raw as Profile;

  if (!p || typeof p !== "object") {
    throw new Error("profile.json must contain a JSON object");
  }
  if (!isNonEmptyString(p.name)) errors.push(`"name" is required`);
  if (!isNonEmptyString(p.location)) errors.push(`"location" is required`);
  if (!TRACK_KEYS.includes(p.defaultPersona)) {
    errors.push(`"defaultPersona" must be one of: ${TRACK_KEYS.join(", ")}`);
  }

  if (!p.personas || typeof p.personas !== "object") {
    errors.push(`"personas" is required`);
  } else {
    if (TRACK_KEYS.includes(p.defaultPersona) && !p.personas[p.defaultPersona]) {
      errors.push(`"personas.${p.defaultPersona}" must be defined because it is the defaultPersona`);
    }
    for (const [key, persona] of Object.entries(p.personas)) {
      if (!TRACK_KEYS.includes(key as CandidateTrackKey)) {
        errors.push(`unknown persona "${key}" (expected one of: ${TRACK_KEYS.join(", ")})`);
        continue;
      }
      for (const field of ["displayName", "badgeName", "titleInSignature", "resume", "context", "pitchGuidance", "defaultSubject"] as const) {
        if (!isNonEmptyString(persona?.[field])) errors.push(`"personas.${key}.${field}" is required`);
      }
      if (isNonEmptyString(persona?.resume)) {
        if (persona.resume !== path.basename(persona.resume) || !persona.resume.toLowerCase().endsWith(".pdf")) {
          errors.push(`"personas.${key}.resume" must be a plain .pdf filename inside the profile folder`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid profile.json:\n  - ${errors.join("\n  - ")}`);
  }
  return p;
}

let cachedProfile: Profile | null = null;

export function loadProfile(): Profile {
  if (cachedProfile) return cachedProfile;

  const profilePath = path.join(getProfileDir(), "profile.json");
  if (!fs.existsSync(profilePath)) {
    throw new Error(
      `No profile found at ${profilePath}.\n` +
        `Copy examples/profile/ to profile/ and fill in your details (or set PROFILE_DIR).`
    );
  }

  cachedProfile = parseProfile(JSON.parse(fs.readFileSync(profilePath, "utf-8")));
  return cachedProfile;
}
