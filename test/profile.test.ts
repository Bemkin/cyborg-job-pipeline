import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseProfile } from "../src/profile";
import {
  buildSenderSignature,
  detectTrackKey,
  getPersona,
} from "../src/data/candidatePersonas";
import { DEFAULT_KEYWORDS, matchKeywords } from "../src/filters";

const examplePath = path.join(__dirname, "..", "examples", "profile", "profile.json");
const exampleProfile = () => JSON.parse(fs.readFileSync(examplePath, "utf-8"));

describe("parseProfile", () => {
  it("accepts the example profile", () => {
    expect(() => parseProfile(exampleProfile())).not.toThrow();
  });

  it("lists every missing field at once", () => {
    const raw = exampleProfile();
    delete raw.name;
    delete raw.personas.backend.context;
    expect(() => parseProfile(raw)).toThrow(/"name" is required[\s\S]*"personas.backend.context" is required/);
  });

  it("requires the default persona to be defined", () => {
    const raw = exampleProfile();
    raw.defaultPersona = "backend";
    delete raw.personas.backend;
    expect(() => parseProfile(raw)).toThrow(/personas.backend/);
  });

  it("rejects resume paths that escape the profile folder", () => {
    const raw = exampleProfile();
    raw.personas.fullstack.resume = "../.env";
    expect(() => parseProfile(raw)).toThrow(/plain \.pdf filename/);
  });
});

describe("getPersona", () => {
  const profile = parseProfile(exampleProfile());

  it("builds subjects from the matching rule plus the candidate's name", () => {
    expect(getPersona(profile, "fullstack").buildSubject("Senior React Developer")).toBe(
      "Frontend Engineer Application — Jane Doe"
    );
    expect(getPersona(profile, "fullstack").buildSubject("Software Engineer")).toBe(
      "Software Engineer Application — Jane Doe"
    );
  });

  it("falls back to the default persona when a track isn't defined", () => {
    const partial = parseProfile({ ...exampleProfile(), personas: { fullstack: exampleProfile().personas.fullstack } });
    expect(getPersona(partial, "backend").key).toBe("fullstack");
  });

  it("builds the signature from profile links", () => {
    const signature = buildSenderSignature(profile, getPersona(profile, "backend"));
    expect(signature).toBe(
      [
        "Best regards,",
        "Jane Doe",
        "Backend Engineer",
        "GitHub: https://github.com/janedoe",
        "LinkedIn: https://www.linkedin.com/in/janedoe/",
        "Portfolio: https://janedoe.dev",
      ].join("\n")
    );
  });
});

describe("detectTrackKey", () => {
  it("routes by job title first", () => {
    expect(detectTrackKey("Founding Engineer", "")).toBe("ai_founding");
    expect(detectTrackKey("Frontend Engineer", "")).toBe("fullstack");
    expect(detectTrackKey("Senior Backend Engineer", "")).toBe("backend");
  });

  it("sends AI-heavy full-stack roles to the AI track", () => {
    expect(detectTrackKey("Full-Stack Engineer", "We build agentic LLM apps with RAG and embeddings")).toBe(
      "ai_founding"
    );
    expect(detectTrackKey("Full-Stack Engineer", "React and Postgres")).toBe("fullstack");
  });

  it("scores generic titles by description", () => {
    expect(detectTrackKey("Software Engineer", "postgres, aws lambda, docker, redis")).toBe("backend");
    expect(detectTrackKey("Software Engineer", "react, tailwind, css")).toBe("fullstack");
  });
});

describe("matchKeywords", () => {
  it("matches case-insensitively across all texts", () => {
    expect(matchKeywords(["typescript", "react", "rust"], "Senior Engineer", "We use TypeScript and React")).toEqual([
      "typescript",
      "react",
    ]);
  });

  it("returns nothing for unrelated jobs", () => {
    expect(matchKeywords(DEFAULT_KEYWORDS, "Account Executive", "Own the enterprise sales pipeline")).toEqual([]);
  });
});
