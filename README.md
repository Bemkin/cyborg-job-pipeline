# 🤖 Cyborg Job Pipeline: Autonomous Sourcing & 1-Tap Cold Outreach

> A human-in-the-loop job hunting pipeline. It surfaces remote engineering roles, finds the decision-makers behind them (Founders, CTOs, VPs) with verified emails, drafts a tailored pitch with Google Gemini, and sends it from your Gmail **only after you tap Send in Telegram**.

[![CI](https://github.com/Bemkin/cyborg-job-pipeline/actions/workflows/ci.yml/badge.svg)](https://github.com/Bemkin/cyborg-job-pipeline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ⚡ Overview

Applying manually to high-signal roles is broken: hopping between job boards, finding founders on LinkedIn/Apollo, writing custom cover letters, and switching to your email client takes 30+ minutes per company.

**Cyborg Job Pipeline** automates the busywork while keeping you firmly in the driver's seat:

```
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│  Job Sources    │ ───▶  │ RocketReach API      │ ───▶  │ Google Gemini        │
│ RemoteOK (+LI)  │       │ Founder / CTO Lookup │       │ Context-Aware Pitch  │
└─────────────────┘       └──────────────────────┘       └──────────┬───────────┘
                                                                    │
                                                                    ▼
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│ Verified Email  │ ◀───  │ Telegram Bot Daemon  │ ◀───  │ Interactive Alert    │
│ Delivered w/ CV │       │ One-Tap Dispatcher   │       │ [Send] [Edit] [Skip] │
└─────────────────┘       └──────────────────────┘       └──────────────────────┘
```

### Design principles

- **You approve every email.** The pipeline only drafts. Nothing is sent until you tap Send, and the bot only responds to your own Telegram chat.
- **Protect your sender reputation.** Free-webmail addresses and stale previous-employer domains are blocked, and NeverBounce/Verimail can verify mailboxes before sending.
- **Your data stays yours.** Everything personal lives in a gitignored `profile/` folder, not in the code.

---

## 🚀 Key Features

* **Targeted Role Sourcing**: Pulls remote engineering roles from RemoteOK and filters them by your keywords.
* **Decision-Maker Discovery**: Uses the **RocketReach API** to skip generic `jobs@` inboxes, searching title priorities (Founder, CTO, VP Engineering, Head of People) for a direct contact.
* **Anti-Bounce Verification**: Company domain matching, free-webmail blocking, and optional **NeverBounce** / **Verimail** real-time checks.
* **Multiple Personas**: Define full-stack, backend and founding/AI variants of your pitch and resume; each job is routed to the best fit automatically.
* **AI-Powered Pitch Synthesis**: **Google Gemini** writes a concise, specific 3-sentence pitch from your profile, and skips roles that don't fit (non-technical, or on-site when you're remote-only).
* **1-Tap Telegram Dispatch**: Every vetted lead arrives in Telegram with inline buttons:
  * `[ ✉️ Send Email ]` sends the pitch from your Gmail with the matching **PDF resume attached**.
  * `[ ✏️ Edit Draft ]` lets you reply with your own wording before sending.
  * `[ ❌ Skip ]` dismisses the lead.
* **Deduplication**: Seen jobs are cached so you never get the same alert twice.
* **Resume Generator** *(optional)*: Render tailored PDF resumes from JSON with `npm run build:resumes`.

---

## 🛠️ Tech Stack

* **Runtime & Language**: Node.js 20+, TypeScript
* **LLM Engine**: Google Gemini API (`@google/generative-ai`)
* **Enrichment**: RocketReach API v2, NeverBounce, Verimail
* **Mobile Interface**: Telegram Bot API (`node-telegram-bot-api`)
* **Email Dispatch**: Nodemailer (Gmail SMTP) or a Google Apps Script HTTPS relay
* **Scraping & Parsing**: Axios, Cheerio, Playwright
* **Testing**: Vitest

---

## 📦 Getting Started

### 1. Prerequisites

* Node.js v20+
* A Telegram bot token (from [@BotFather](https://t.me/botfather)) and your chat ID (from [@userinfobot](https://t.me/userinfobot))
* A Google AI Studio API key ([AI Studio](https://aistudio.google.com/apikey))
* A RocketReach API key ([RocketReach](https://rocketreach.co/api))
* *(Optional)* A NeverBounce or Verimail API key for mailbox verification
* A Gmail account with 2-Step Verification and an [App Password](https://myaccount.google.com/apppasswords)

### 2. Install

```bash
git clone https://github.com/Bemkin/cyborg-job-pipeline.git
cd cyborg-job-pipeline
npm install
```

### 3. Configure secrets

```bash
cp .env.example .env
```

Fill in the values in `.env`. `TELEGRAM_CHAT_ID` is required: the bot ignores every other chat.

### 4. Create your profile

```bash
cp -r examples/profile profile
```

Edit `profile/profile.json`:

| Field | What it's for |
| --- | --- |
| `name`, `location` | Used in the email signature, subject lines and the AI's location filter |
| `remoteOnly` | When `true`, the AI skips on-site, hybrid and residency-restricted roles |
| `signatureLinks` | Links appended under your signature |
| `keywords` | *(Optional)* Stage 1 filter keywords; a sensible default list is used if omitted |
| `defaultPersona` | Persona used when a track isn't defined |
| `personas.fullstack` / `backend` / `ai_founding` | Per-track pitch context, tone guidance, subject rules and resume filename. Define at least the default one. |

Put each persona's PDF resume in `profile/`, using the filename from its `resume` field. The `profile/` folder is gitignored. To keep it elsewhere, set `PROFILE_DIR`.

---

## 💻 Usage

### Dry run (filters only, no API calls)

```bash
npm run start:dry
```

### Run the pipeline (scrape, enrich, draft, alert)

```bash
npm start
```

On Windows you can double-click `run-pipeline.bat`, or schedule it daily with Task Scheduler.

### Start the bot daemon (listens for your taps)

```bash
npm run bot
```

On Windows, `run-bot.bat` runs it in a window and `start-bot-silent.vbs` runs it in the background.

### Send yourself a demo alert

```bash
npm run test:alert
```

### Generate tailored resume PDFs (optional)

Describe your resumes in `profile/resumes.json` (see `examples/profile/resumes.json`), then:

```bash
npm run build:resumes
```

---

## 📱 Telegram Bot Commands

* `/status`: daemon status, connected Gmail address, and pending/sent counts.
* `/testemail`: sends a test email with your default resume attached to yourself.

---

## ☁️ Deploying the Daemon to Render (optional)

`render.yaml` deploys the bot daemon as a free Render web service so you can approve emails while your laptop is off. The pipeline keeps running locally and syncs drafts to it.

1. Create the service from `render.yaml` and fill in the secret environment variables.
2. Add your `profile.json` as a **Secret File** named `profile.json` (it's mounted in `/etc/secrets`, which `PROFILE_DIR` already points to).
3. Provide your resumes. Render's Secret Files only hold text, so a PDF uploaded directly arrives blank. Instead, add a base64 copy of each PDF as a Secret File named `<resume filename>.b64`:
   ```bash
   base64 -w0 "profile/Jane_Doe_Resume.pdf" > "profile/Jane_Doe_Resume.pdf.b64"
   ```
   Alternatively, give each persona a `resumeUrl` in `profile.json` that points to a hosted copy of its PDF. Render file names can't contain spaces, so use underscores in resume filenames.
4. Render's free tier blocks outbound SMTP, so deploy [`scripts/apps-script-relay.gs`](scripts/apps-script-relay.gs) as a Google Apps Script web app (setup steps are at the top of the file) and set `GMAIL_WEBHOOK_URL` to its URL. Store the same `SYNC_SECRET` in the script's Script Properties.
5. Locally, set `RENDER_DAEMON_URL` and the same `SYNC_SECRET` in `.env`. New drafts sync automatically, or run `npm run sync:cloud` to push existing ones.

The draft API rejects every request unless `SYNC_SECRET` is set and sent in the `x-sync-secret` header.

---

## ⚠️ LinkedIn Scraping

The optional LinkedIn source (`npm run login:linkedin`, then `npm run start:linkedin`) drives a logged-in browser session. Automated scraping is against LinkedIn's Terms of Service and can get your account restricted. It's off unless you log in, and you use it at your own risk.

---

## 🧪 Development

```bash
npm run typecheck
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 👤 Author

**Bemnet Kibret**

* **GitHub**: [@Bemkin](https://github.com/Bemkin)
* **LinkedIn**: [linkedin.com/in/bemnet-kibret-054a792a9](https://www.linkedin.com/in/bemnet-kibret-054a792a9/)
* **Portfolio**: [my-portfolio-theta-flame-45.vercel.app](https://my-portfolio-theta-flame-45.vercel.app)

---

## 📄 License

[MIT](LICENSE) © 2026 Bemnet Kibret
