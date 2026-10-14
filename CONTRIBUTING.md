# Contributing

Thanks for your interest in improving Cyborg Job Pipeline!

## Getting set up

```bash
npm install
cp .env.example .env
cp -r examples/profile profile
npm run typecheck
npm test
```

`npm run start:dry` exercises the scraping and filtering stages without calling Gemini, RocketReach, Telegram or Gmail.

## Ground rules

These are deliberate design choices. Pull requests that remove them won't be merged:

- **A human approves every email.** The pipeline drafts; only a tap in Telegram sends. No auto-send, bulk-send or scheduled-send modes.
- **Bounce protection stays on.** Free-webmail blocking, company-domain matching and the optional NeverBounce/Verimail checks protect both the sender and the recipient.
- **No personal data in code.** Names, resume text, links and PDFs belong in `profile/` (gitignored), with templates in `examples/profile/`.

## Pull requests

- Keep changes focused; one feature or fix per PR.
- Add or update tests in `test/` for logic changes (filters, routing, validation).
- Make sure `npm run typecheck` and `npm test` pass.
- Never commit `.env`, `profile/`, `drafts_cache.json`, `seen_jobs.json` or `.linkedin-session/`.

## Reporting security issues

Please don't open a public issue for vulnerabilities (for example, ways to make the bot send email or attach files without the owner's approval). Contact the maintainer privately through their GitHub profile instead.
