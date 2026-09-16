import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { saveDraft } from "../src/bot-daemon";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID!;
const jobId = "test_demo_01";

async function main() {
  saveDraft({
    jobId,
    jobTitle: "Founding AI Engineer (Demo Test)",
    company: "Physical Superintelligence",
    recipientEmail: process.env.GMAIL_USER!,
    recipientName: "Alex Wissner-Gross",
    draftEmail: `Hi Alex,

I saw the Founding AI Engineer role at Physical Superintelligence and wanted to connect directly.

At Senselet, I lead autonomous AI architecture with multi-model failover, agentic function-calling tools, and resilient production infra. I would love to chat about accelerating PSI's mission.

Best regards,
Bemnet Kibret`,
    subject: "Founding AI Engineer / PSI — Bemnet Kibret",
    url: "https://remoteok.com",
    createdAt: new Date().toISOString(),
    status: "pending",
  });

  const message =
`🏢 *Founding AI Engineer — Physical Superintelligence*

🔗 [Apply Here](https://remoteok.com)

🔑 *Matched Keywords:* founding engineer, agentic, applied ai

👤 *Decision Maker:*
   Name: Alex Wissner\\-Gross
   Title: Founder & Chief Scientist
   Email: \`${process.env.GMAIL_USER}\`

✉️ *Personalized Draft Email:*
Hi Alex\\,
I saw the Founding AI Engineer role at Physical Superintelligence\\.\\.\\.

👇 *Try tapping one of the buttons below:*`;

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✉️ Send Test Email", callback_data: `send:${jobId}` },
          { text: "✏️ Edit Draft", callback_data: `edit:${jobId}` },
          { text: "❌ Skip", callback_data: `skip:${jobId}` },
        ],
      ],
    },
  });

  console.log("DEMO_ALERT_SENT_SUCCESSFULLY");
}

main().catch(console.error);
