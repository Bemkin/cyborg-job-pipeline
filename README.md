# 🤖 Cyborg Job Pipeline: Autonomous Sourcing & 1-Tap Cold Outreach

> An end-to-end autonomous job hunting and executive outreach pipeline. Slices through noise to surface niche AI and Founding Engineer roles, identifies direct decision-makers (Founders, CTOs, VPs) with verified emails via RocketReach, synthesizes hyper-tailored pitches using Google Gemini, and dispatches cold emails directly from your phone with a single tap in Telegram.

---

## ⚡ Overview

Applying manually to high-signal roles is broken: hopping between job boards, finding founders on LinkedIn/Apollo, writing custom cover letters, and switching to your email client takes 30+ minutes per company.

**Cyborg Job Pipeline** automates the entire friction loop while keeping you firmly in the driver's seat:

```
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│  Job Board API  │ ───▶  │ RocketReach API      │ ───▶  │ Google Gemini 3.5    │
│  RemoteOK & RSS │       │ Founder / CTO Lookup │       │ Context-Aware Pitch  │
└─────────────────┘       └──────────────────────┘       └──────────┬───────────┘
                                                                    │
                                                                    ▼
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│ Verified Email  │ ◀───  │ Telegram Bot Daemon  │ ◀───  │ Interactive Alert    │
│ Delivered w/ CV │       │ One-Tap Dispatcher   │       │ [Send] [Edit] [Skip] │
└─────────────────┘       └──────────────────────┘       └──────────────────────┘
```

---

## 🚀 Key Features

* **Targeted Role Sourcing**: Automatically scrapes and filters high-velocity remote engineering roles matching high-signal technical keywords (Agentic AI, TypeScript, Next.js, Postgres, Supabase).
* **Executive Decision-Maker Discovery**: Integrates with the **RocketReach API** to bypass generic `jobs@` black holes. Automatically searches hierarchical title priorities (Founder, Co-Founder, CTO, VP Engineering, Head of People) to surface direct contacts.
* **Anti-Bounce & Domain Verification**: Performs company domain matching, blocks free webmail addresses, and integrates with **NeverBounce Single Check API v4** for real-time mailbox deliverability checks to protect your Gmail sender reputation.
* **AI-Powered Pitch Synthesis**: Leverages **Google Gemini** with structured prompt engineering to analyze the company's tech stack and mission against your specific portfolio and production accomplishments, generating a concise, zero-fluff cold pitch.
* **1-Tap Telegram Dispatch**: Delivers every vetted lead straight to your Telegram bot with interactive inline buttons:
  * `[ ✉️ Send Email ]` — Immediately dispatches the personalized pitch via Gmail SMTP with your **PDF resume attached**.
  * `[ ✏️ Edit Draft ]` — Prompts you in Telegram to reply with custom tweaks before sending.
  * `[ ❌ Skip ]` — Dismisses the lead cleanly.
* **Persistent Bot Daemon**: Lightweight Node.js service running in the background, listening for button taps and Telegram commands (`/status`, `/testemail`).
* **Deterministic Deduplication**: Maintains local cache state to ensure you never process or receive duplicate job alerts.

---

## 🛠️ Tech Stack

* **Runtime & Language**: Node.js, TypeScript
* **LLM Engine**: Google Gemini API (`@google/generative-ai`)
* **Enrichment**: RocketReach API v2
* **Mobile Interface**: Telegram Bot API (`node-telegram-bot-api`)
* **Email Dispatch**: Nodemailer (Gmail SMTP + PDF Attachment)
* **Scraping & Parsing**: Axios, Cheerio

---

## 📦 Getting Started

### 1. Prerequisites
* Node.js v18+ installed
* A Telegram account and bot token (from [@BotFather](https://t.me/botfather))
* A Google AI Studio API key (from [AI Studio](https://aistudio.google.com/apikey))
* A RocketReach API key (from [RocketReach](https://rocketreach.co/api))
* A NeverBounce API key (Optional real-time verification from [NeverBounce](https://neverbounce.com))
* A Gmail account with 2-Step Verification enabled and an [App Password](https://myaccount.google.com/apppasswords)

### 2. Installation

Clone this repository and install dependencies:

```bash
git clone https://github.com/Bemkin/cyborg-job-pipeline.git
cd cyborg-job-pipeline
npm install
```

### 3. Configuration

Copy `.env.example` to `.env` and provide your credentials:

```bash
cp .env.example .env
```

Fill in the required environment variables:

```env
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_personal_telegram_chat_id

# RocketReach API
ROCKETREACH_API_KEY=your_rocketreach_api_key_here

# Gmail SMTP
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password
```

### 4. Add Your Resume PDF
Place your 1-page PDF resume in the root directory named:
`Bemnet Kibret - Founding Full-Stack Engineer Resume.pdf` *(or update `RESUME_FILENAME` in `src/bot-daemon.ts`)*.

---

## 💻 Usage

### Run a Dry Run (Testing Filters without API Calls)
```bash
npm run start:dry
```

### Run the Job Pipeline (Scrape, Enrich & Send Alerts)
```bash
npm start
```
Or on Windows, double-click `run-pipeline.bat`.

### Start the Bot Daemon (Listens for One-Tap Sends)
```bash
npm run bot
```
Or on Windows, double-click `run-bot.bat`.

---

## 📱 Telegram Bot Commands

When the daemon is running, you can send these commands to your bot anytime:
* `/status` — View active daemon status, connected Gmail address, and pending/sent stats.
* `/testemail` — Sends an instant verification test email with your attached resume to yourself.

---

## 👤 Author

**Bemnet Kibret**
* **GitHub**: [@Bemkin](https://github.com/Bemkin)
* **LinkedIn**: [linkedin.com/in/bemnet-kibret-054a792a9](https://www.linkedin.com/in/bemnet-kibret-054a792a9/)
* **Portfolio**: [my-portfolio-theta-flame-45.vercel.app](https://my-portfolio-theta-flame-45.vercel.app)
* **Live CV**: [my-portfolio-theta-flame-45.vercel.app/resume](https://my-portfolio-theta-flame-45.vercel.app/resume)

---

## 📄 License

MIT License © 2026 Bemnet Kibret. Feel free to use and adapt this pipeline for your own job search workflows.
