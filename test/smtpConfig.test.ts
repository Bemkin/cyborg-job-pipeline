import { describe, it, expect } from "vitest";
import { getSmtpConfig, createSmtpTransporter } from "../src/smtp";

describe("getSmtpConfig", () => {
  it("defaults to Gmail configuration when SMTP_HOST is not set", () => {
    const env: NodeJS.ProcessEnv = {
      GMAIL_USER: "test@gmail.com",
      GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
    };

    const config = getSmtpConfig(env);
    expect(config.isCustomSmtp).toBe(false);
    expect(config.host).toBe("smtp.gmail.com");
    expect(config.port).toBe(465);
    expect(config.secure).toBe(true);
    expect(config.auth.user).toBe("test@gmail.com");
    expect(config.auth.pass).toBe("abcdefghijklmnop");
    expect(config.fromAddress).toBe("test@gmail.com");
  });

  it("resolves custom SMTP settings with explicit host, port, credentials, and fromAddress", () => {
    const env: NodeJS.ProcessEnv = {
      SMTP_HOST: "smtp.mailgun.org",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_USER: "postmaster@mycustomdomain.com",
      SMTP_PASS: "secret123",
      SMTP_FROM: "hello@mycustomdomain.com",
    };

    const config = getSmtpConfig(env);
    expect(config.isCustomSmtp).toBe(true);
    expect(config.host).toBe("smtp.mailgun.org");
    expect(config.port).toBe(587);
    expect(config.secure).toBe(false);
    expect(config.auth.user).toBe("postmaster@mycustomdomain.com");
    expect(config.auth.pass).toBe("secret123");
    expect(config.fromAddress).toBe("hello@mycustomdomain.com");
  });

  it("infers port 465 when SMTP_SECURE is true and SMTP_PORT is omitted", () => {
    const env: NodeJS.ProcessEnv = {
      SMTP_HOST: "mail.fastmail.com",
      SMTP_SECURE: "true",
      SMTP_USER: "user@fastmail.com",
      SMTP_PASS: "app-pass",
    };

    const config = getSmtpConfig(env);
    expect(config.isCustomSmtp).toBe(true);
    expect(config.host).toBe("mail.fastmail.com");
    expect(config.port).toBe(465);
    expect(config.secure).toBe(true);
    expect(config.fromAddress).toBe("user@fastmail.com");
  });

  it("falls back to GMAIL_USER and GMAIL_APP_PASSWORD when SMTP_USER/PASS are not set", () => {
    const env: NodeJS.ProcessEnv = {
      SMTP_HOST: "smtp.office365.com",
      GMAIL_USER: "fallback@office.com",
      GMAIL_APP_PASSWORD: "officepassword",
    };

    const config = getSmtpConfig(env);
    expect(config.isCustomSmtp).toBe(true);
    expect(config.host).toBe("smtp.office365.com");
    expect(config.auth.user).toBe("fallback@office.com");
    expect(config.auth.pass).toBe("officepassword");
    expect(config.fromAddress).toBe("fallback@office.com");
  });

  it("creates a transporter instance matching the resolved config", () => {
    const env: NodeJS.ProcessEnv = {
      SMTP_HOST: "smtp.postmarkapp.com",
      SMTP_PORT: "2525",
      SMTP_SECURE: "false",
      SMTP_USER: "token",
      SMTP_PASS: "token",
    };

    const config = getSmtpConfig(env);
    const transporter = createSmtpTransporter(config);
    expect(transporter).toBeDefined();
    expect(transporter.options).toMatchObject({
      host: "smtp.postmarkapp.com",
      port: 2525,
      secure: false,
    });
  });
});
