import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseProfile } from "../src/profile";
import { getPersona, loadResumeAttachment } from "../src/data/candidatePersonas";

const examplePath = path.join(__dirname, "..", "examples", "profile", "profile.json");
const profile = parseProfile(JSON.parse(fs.readFileSync(examplePath, "utf-8")));
const persona = getPersona(profile, "fullstack");
const pdfBytes = Buffer.from("%PDF-1.4\n\xe2\xe3\xcf\xd3 binary bytes \x00\xff\n%%EOF", "latin1");

describe("loadResumeAttachment", () => {
  let dir: string;
  const originalProfileDir = process.env.PROFILE_DIR;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-"));
    process.env.PROFILE_DIR = dir;
  });

  afterEach(() => {
    process.env.PROFILE_DIR = originalProfileDir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads the PDF from the profile folder", async () => {
    fs.writeFileSync(path.join(dir, persona.resume), pdfBytes);
    const resume = await loadResumeAttachment(persona);
    expect(resume?.filename).toBe(persona.resume);
    expect(resume?.content.equals(pdfBytes)).toBe(true);
  });

  it("decodes a wrapped base64 copy byte-for-byte", async () => {
    const wrapped = pdfBytes.toString("base64").replace(/(.{20})/g, "$1\n");
    fs.writeFileSync(path.join(dir, `${persona.resume}.b64`), wrapped);
    const resume = await loadResumeAttachment(persona);
    expect(resume?.filename).toBe(persona.resume);
    expect(resume?.content.equals(pdfBytes)).toBe(true);
  });

  it("returns null when no copy or URL is available", async () => {
    expect(await loadResumeAttachment(persona)).toBeNull();
  });
});
