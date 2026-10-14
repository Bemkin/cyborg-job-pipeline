import { describe, expect, it } from "vitest";
import {
  extractValidWorkEmail,
  getDomainCore,
  isDomainMatchingCompany,
  validateCorporateEmail,
} from "../src/utils/emailValidator";

describe("getDomainCore", () => {
  it("returns the first label of the domain", () => {
    expect(getDomainCore("acme.com")).toBe("acme");
    expect(getDomainCore("acme.co.uk")).toBe("acme");
    expect(getDomainCore("my-company.io")).toBe("mycompany");
  });
});

describe("isDomainMatchingCompany", () => {
  it("matches domains that contain the company name", () => {
    expect(isDomainMatchingCompany("gocanonical.com", "Canonical")).toBe(true);
    expect(isDomainMatchingCompany("stripe.com", "Stripe, Inc.")).toBe(true);
  });

  it("matches on a significant company token, ignoring noise words", () => {
    expect(isDomainMatchingCompany("acmerobotics.com", "Acme Robotics Technologies")).toBe(true);
  });

  it("rejects a previous employer's domain", () => {
    expect(isDomainMatchingCompany("practicepal.io", "The Flex")).toBe(false);
  });

  it("rejects free webmail even if the name overlaps", () => {
    expect(isDomainMatchingCompany("gmail.com", "Gmail Labs")).toBe(false);
  });
});

describe("validateCorporateEmail", () => {
  it("accepts a work email at the company domain", () => {
    expect(validateCorporateEmail("ceo@acme.com", "Acme")).toEqual({ valid: true });
  });

  it("rejects malformed addresses", () => {
    expect(validateCorporateEmail("not-an-email", "Acme").valid).toBe(false);
  });

  it("rejects personal webmail", () => {
    const result = validateCorporateEmail("founder@gmail.com", "Acme");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/webmail/);
  });

  it("rejects a domain that doesn't match the company", () => {
    const result = validateCorporateEmail("cto@othercorp.com", "Acme");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });
});

describe("extractValidWorkEmail", () => {
  it("prefers a verified professional email at the company domain", () => {
    const result = extractValidWorkEmail(
      [
        { email: "jane@gmail.com", smtp_valid: "valid", type: "personal" },
        { email: "jane@oldjob.com", smtp_valid: "valid", type: "professional" },
        { email: "jane@acme.com", smtp_valid: "valid", type: "professional" },
      ],
      "Acme"
    );
    expect(result?.email).toBe("jane@acme.com");
  });

  it("never falls back to unverified addresses", () => {
    expect(
      extractValidWorkEmail([{ email: "jane@acme.com", smtp_valid: "invalid", type: "professional" }], "Acme")
    ).toBeNull();
  });

  it("handles empty and malformed input", () => {
    expect(extractValidWorkEmail([], "Acme")).toBeNull();
    expect(extractValidWorkEmail(null as any, "Acme")).toBeNull();
  });
});
