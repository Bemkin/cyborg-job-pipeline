import axios from "axios";

/**
 * Email validation and domain verification utilities
 * Protects sender reputation by preventing hard bounces (550 5.1.1) from:
 * 1. Disallowed free/personal webmail services (e.g. Gmail, iCloud, Yahoo)
 * 2. Mismatched company domains (e.g. stale emails from previous employers on RocketReach)
 * 3. Invalid or unverified RocketReach SMTP statuses
 * 4. NeverBounce real-time single check API v4 (mailbox existence verification)
 */

export const DISALLOWED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "yandex.com",
  "gmx.com",
  "fastmail.com",
]);

const COMPANY_NOISE_WORDS = new Set([
  "the", "inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation",
  "co", "company", "group", "holdings", "technologies", "technology", "tech",
  "systems", "system", "solutions", "solution", "services", "service", "consulting",
  "global", "international", "private", "labs", "lab", "software", "digital",
  "interactive", "media", "agency", "ventures", "partners", "studio", "studios",
  "network", "networks", "platform", "platforms", "careers", "talent", "recruitment",
  "io", "ai", "app", "hq", "algorithms"
]);

export function getEmailDomain(email: string): string {
  if (!email || typeof email !== "string") return "";
  const parts = email.toLowerCase().trim().split("@");
  return parts.length === 2 ? parts[1].trim() : "";
}

export function getDomainCore(domain: string): string {
  if (!domain) return "";
  const clean = domain.toLowerCase().trim();
  const parts = clean.split(".");
  if (parts.length <= 1) return clean;
  // Handles domains like 'company.com', 'company.co.uk', 'company.com.ng'
  return parts[0].replace(/[^a-z0-9]/g, "");
}

export function extractCompanyTokens(companyName: string): string[] {
  if (!companyName) return [];
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !COMPANY_NOISE_WORDS.has(w));
}

/**
 * Checks whether an email domain corresponds reasonably to the target company name.
 * Prevents using a contact's old email from a prior company (e.g. practicepal.io for The Flex).
 */
export function isDomainMatchingCompany(emailDomain: string, companyName: string): boolean {
  if (!emailDomain || !companyName) return false;

  const domain = emailDomain.toLowerCase().trim();
  if (DISALLOWED_EMAIL_DOMAINS.has(domain)) {
    return false;
  }

  const domainCore = getDomainCore(domain);
  const cleanCompany = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!domainCore || !cleanCompany) return false;

  // Direct containment: "canonical" in "gocanonical" or "bjak" in "bjak"
  if (domainCore.includes(cleanCompany) || cleanCompany.includes(domainCore)) {
    return true;
  }

  // Token matching: at least one substantial company keyword must match the domain
  const tokens = extractCompanyTokens(companyName);
  if (tokens.length === 0) {
    return domainCore.length >= 3 && cleanCompany.includes(domainCore);
  }

  for (const token of tokens) {
    if (token.length >= 3 && (domainCore.includes(token) || token.includes(domainCore))) {
      return true;
    }
  }

  return false;
}

export interface EmailValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a candidate email against company context and anti-bounce rules.
 */
export function validateCorporateEmail(email: string, companyName: string): EmailValidationResult {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return { valid: false, reason: "Malformed or missing email address" };
  }

  const domain = getEmailDomain(email);
  if (!domain) {
    return { valid: false, reason: "Could not extract email domain" };
  }

  if (DISALLOWED_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, reason: `Disallowed free/personal webmail domain (@${domain})` };
  }

  if (!isDomainMatchingCompany(domain, companyName)) {
    return {
      valid: false,
      reason: `Domain @${domain} does not match company "${companyName}" (stale previous employer)`,
    };
  }

  return { valid: true };
}

/**
 * Parses RocketReach email lists, extracting ONLY strictly verified emails
 * that belong to the current company domain.
 * Returns null if no verified, matching email exists.
 */
export function extractValidWorkEmail(
  emails: any[],
  companyName: string
): { email: string; note: string } | null {
  if (!Array.isArray(emails) || emails.length === 0) return null;

  const normalized = emails
    .map((e) => {
      const email = (typeof e === "string" ? e : e?.email || "").trim().toLowerCase();
      const smtp_valid = (typeof e === "object" ? e?.smtp_valid : "") || "";
      const type = (typeof e === "object" ? e?.type : "") || "";
      return { email, smtp_valid, type };
    })
    .filter((e) => e.email.includes("@"));

  if (normalized.length === 0) return null;

  // 1. Strict priority: smtp_valid === "valid", type === "professional", matching company domain
  for (const item of normalized) {
    if (item.smtp_valid === "valid" && item.type === "professional") {
      const val = validateCorporateEmail(item.email, companyName);
      if (val.valid) {
        return { email: item.email, note: "verified corporate work email" };
      }
    }
  }

  // 2. Secondary priority: smtp_valid === "valid", matching company domain
  for (const item of normalized) {
    if (item.smtp_valid === "valid") {
      const val = validateCorporateEmail(item.email, companyName);
      if (val.valid) {
        return { email: item.email, note: "verified corporate email" };
      }
    }
  }

  // Under NO circumstance fallback to unverified, invalid, or mismatched domains!
  return null;
}

export interface NeverBounceResult {
  valid: boolean;
  result: "valid" | "invalid" | "disposable" | "catchall" | "unknown" | "error";
  reason?: string;
  executionTime?: number;
}

/**
 * Validates an email address in real time using the NeverBounce Single Check API v4.
 * Official docs: https://developers.neverbounce.com/reference/single-check
 */
export async function verifyWithNeverBounce(
  email: string,
  apiKey: string
): Promise<NeverBounceResult> {
  if (!email || !email.includes("@")) {
    return { valid: false, result: "invalid", reason: "Invalid email syntax" };
  }
  if (!apiKey || apiKey.trim() === "") {
    return { valid: false, result: "error", reason: "Missing NEVERBOUNCE_API_KEY" };
  }

  try {
    const response = await axios.get("https://api.neverbounce.com/v4/single/check", {
      params: {
        key: apiKey.trim(),
        email: email.trim(),
      },
      timeout: 8000,
    });

    const data = response.data;
    if (data?.status === "success") {
      const result = data.result as "valid" | "invalid" | "disposable" | "catchall" | "unknown";
      if (result === "valid") {
        return { valid: true, result: "valid", executionTime: data.execution_time };
      }
      return {
        valid: false,
        result,
        reason: `NeverBounce classified mailbox as "${result}"`,
        executionTime: data.execution_time,
      };
    }

    return {
      valid: false,
      result: "error",
      reason: data?.message || `NeverBounce check failed with status: ${data?.status}`,
    };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message || String(error);
    return {
      valid: false,
      result: "error",
      reason: `NeverBounce API error: ${errorMsg}`,
    };
  }
}

export interface VerimailResult {
  valid: boolean;
  result: string; // 'deliverable', 'hardbounce', 'undeliverable', 'disposable', etc.
  deliverable: boolean;
  reason?: string;
  didYouMean?: string;
}

/**
 * Validates an email address in real time using the Verimail API v3.
 * Official docs: https://verimail.io/api
 */
export async function verifyWithVerimail(
  email: string,
  apiKey: string
): Promise<VerimailResult> {
  if (!email || !email.includes("@")) {
    return { valid: false, result: "invalid_format", deliverable: false, reason: "Malformed email" };
  }
  if (!apiKey || apiKey.trim() === "") {
    return { valid: false, result: "missing_key", deliverable: false, reason: "Missing VERIMAIL_API_KEY" };
  }

  try {
    const response = await axios.get("https://api.verimail.io/v3/verify", {
      params: {
        email: email.trim(),
        key: apiKey.trim(),
      },
      timeout: 8000,
    });

    const data = response.data;
    if (data?.status === "success") {
      const isDeliverable = Boolean(data.deliverable);
      return {
        valid: isDeliverable,
        result: data.result || (isDeliverable ? "deliverable" : "undeliverable"),
        deliverable: isDeliverable,
        didYouMean: data.did_you_mean || undefined,
        reason: isDeliverable ? undefined : `Verimail classified as "${data.result || "undeliverable"}" (code ${data.code})`,
      };
    }

    return {
      valid: false,
      result: "error",
      deliverable: false,
      reason: data?.message || `Verimail returned status ${data?.status}`,
    };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message || String(error);
    return {
      valid: false,
      result: "error",
      deliverable: false,
      reason: `Verimail API error: ${errorMsg}`,
    };
  }
}

