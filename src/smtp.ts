import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  fromAddress: string;
  isCustomSmtp: boolean;
}

export function getSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const host = env.SMTP_HOST?.trim();
  const gmailUser = env.GMAIL_USER?.trim() || "";
  const gmailPass = (env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");

  if (host) {
    const secure =
      env.SMTP_SECURE !== undefined
        ? env.SMTP_SECURE.toLowerCase() === "true"
        : env.SMTP_PORT === "465";

    const port = env.SMTP_PORT
      ? parseInt(env.SMTP_PORT, 10)
      : secure
      ? 465
      : 587;

    const user = env.SMTP_USER?.trim() || gmailUser;
    const pass =
      env.SMTP_PASS !== undefined
        ? env.SMTP_PASS.replace(/\s+/g, "")
        : gmailPass;

    const fromAddress = env.SMTP_FROM?.trim() || user || gmailUser;

    return {
      host,
      port,
      secure,
      auth: { user, pass },
      fromAddress,
      isCustomSmtp: true,
    };
  }

  return {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
    fromAddress: gmailUser,
    isCustomSmtp: false,
  };
}

export function createSmtpTransporter(config: SmtpConfig = getSmtpConfig()) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}
