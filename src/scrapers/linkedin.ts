import { chromium, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

export interface LinkedInScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  isTopApplicant?: boolean;
  jobPoster?: {
    name: string;
    title: string;
    profileUrl?: string;
  } | null;
}

const SESSION_DIR = path.join(__dirname, "..", "..", ".linkedin-session");
const STORAGE_STATE_PATH = path.join(SESSION_DIR, "storageState.json");

function log(emoji: string, message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${emoji} ${message}`);
}

function delay(ms: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

/**
 * Initializes a Playwright browser context using either:
 * 1. Saved storageState.json
 * 2. LINKEDIN_LI_AT environment variable
 * 3. Interactive login window (if no session exists or forceLogin=true)
 */
export async function getLinkedInContext(
  forceLogin = false
): Promise<{ context: BrowserContext; isHeadless: boolean }> {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const hasStorage = fs.existsSync(STORAGE_STATE_PATH);
  const liAtCookie = process.env.LINKEDIN_LI_AT;

  const needsLogin = forceLogin || (!hasStorage && !liAtCookie);

  if (needsLogin) {
    log("🔐", "Opening interactive Chrome window for LinkedIn authentication...");
    log("👉", "Please log into LinkedIn in the opened browser window.");

    const browser = await chromium.launch({
      channel: "chrome",
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    // Strip navigator.webdriver flag so Google OAuth does not block sign-in
    await context.addInitScript(
      "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    );

    const page = await context.newPage();
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });

    log("⏳", "Waiting for you to log in (waiting for https://www.linkedin.com/feed/ or /jobs/)...");

    await page.waitForURL(/linkedin\.com\/(feed|jobs|checkpoint)/, {
      timeout: 180000,
    });

    if (page.url().includes("checkpoint")) {
      log("⏳", "Security check detected. Please complete the verification in browser...");
      await page.waitForURL(/linkedin\.com\/(feed|jobs)/, { timeout: 180000 });
    }

    log("✅", "Login successful! Saving session state for future scheduled runs...");
    await context.storageState({ path: STORAGE_STATE_PATH });
    log("💾", `Session saved to ${STORAGE_STATE_PATH}`);

    return { context, isHeadless: false };
  }

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
    ],
  });

  let context: BrowserContext;

  if (hasStorage) {
    log("🔑", "Restoring LinkedIn session from saved storageState...");
    context = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
  } else {
    log("🔑", "Injecting LinkedIn session cookie (li_at) from .env...");
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    await context.addCookies([
      {
        name: "li_at",
        value: liAtCookie!,
        domain: ".linkedin.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ]);
  }

  return { context, isHeadless: true };
}

/**
 * Scrapes recommended jobs from LinkedIn:
 * 1. Dedicated "Top Applicant" collection (if accessible)
 * 2. "Jobs based on your preferences"
 * Detects "You'd be a top applicant" badges across all listings.
 */
export async function scrapeLinkedInRecommendedJobs(
  maxJobs = 20,
  forceLogin = false
): Promise<LinkedInScrapedJob[]> {
  const { context } = await getLinkedInContext(forceLogin);
  const page = await context.newPage();

  const scrapedJobs: LinkedInScrapedJob[] = [];
  const visitedUrls = new Set<string>();

  // URLs to query in priority order (f_WT=2 filters for Remote workplace type on LinkedIn):
  // 1. Dedicated Top Applicant collection (Remote only)
  // 2. Main Recommended Jobs collection (Remote only)
  const targetUrls = [
    "https://www.linkedin.com/jobs/collections/top-applicant/?f_WT=2",
    "https://www.linkedin.com/jobs/?f_WT=2",
  ];

  try {
    for (const targetUrl of targetUrls) {
      if (scrapedJobs.length >= maxJobs) break;

      const isTopApplicantCollection = targetUrl.includes("top-applicant");
      log(
        "🌐",
        `Navigating to LinkedIn Jobs: ${
          isTopApplicantCollection ? "Top Applicant Collection" : "Recommended Preferences"
        }...`
      );

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      }).catch((e) => log("⚠️", `Navigation notice: ${e.message}`));

      await delay(3000);

      // Verify login status
      if (page.url().includes("/login") || page.url().includes("/authwall")) {
        log("⚠️", "LinkedIn session expired or redirected to authwall. Triggering re-login...");
        await context.browser()?.close();
        return scrapeLinkedInRecommendedJobs(maxJobs, true);
      }

      // Scan for job cards
      log("🔎", "Scanning for job cards...");
      await page.waitForSelector(
        "ul.scaffold-layout__list-container, .jobs-search-results-list, [data-job-id], .job-card-container",
        { timeout: 12000 }
      ).catch(() => null);

      const jobCardElements = await page.$$(
        "li.jobs-search-results__list-item, div.job-card-container, [data-job-id], .scaffold-layout__list-item"
      );

      log(
        "📋",
        `Found ${jobCardElements.length} cards in this view. Extracting details...`
      );

      for (let i = 0; i < jobCardElements.length; i++) {
        if (scrapedJobs.length >= maxJobs) break;

        try {
          const card = jobCardElements[i];

          // 1. Extract Job ID directly from the card element
          const cardJobId =
            (await card.getAttribute("data-job-id")) ||
            (await card.getAttribute("data-occludable-job-id")) ||
            (await card.$("[data-job-id]").then((el) => (el ? el.getAttribute("data-job-id") : null))) ||
            (await card.$("a[href*='/jobs/view/']").then(async (el) => {
              if (!el) return null;
              const href = await el.getAttribute("href");
              const m = href?.match(/\/jobs\/view\/(\d+)/);
              return m ? m[1] : null;
            }));

          // 2. Extract Title and Company from the card
          const cardTitleEl = await card.$(
            "a.job-card-list__title, [class*='job-card-list__title'], .artdeco-entity-lockup__title a, [data-control-name='job_card_title']"
          );
          const rawCardTitle = cardTitleEl ? (await cardTitleEl.innerText()).trim() : "";

          const cardCompanyEl = await card.$(
            ".artdeco-entity-lockup__subtitle, [class*='job-card-container__primary-description'], [class*='company-name']"
          );
          const rawCardCompany = cardCompanyEl ? (await cardCompanyEl.innerText()).trim() : "";

          // Check card text for "top applicant"
          const cardText = await card.innerText().catch(() => "");

          // Click card to load right pane
          await card.scrollIntoViewIfNeeded().catch(() => null);
          await card.click().catch(() => null);
          await delay(1800);

          // Canonical URL
          const currentUrl = page.url();
          const pageJobIdMatch =
            currentUrl.match(/currentJobId=(\d+)/) || currentUrl.match(/jobs\/view\/(\d+)/);
          const effectiveJobId =
            cardJobId || (pageJobIdMatch ? pageJobIdMatch[1] : `li_${Date.now()}_${i}`);
          const canonicalUrl = `https://www.linkedin.com/jobs/view/${effectiveJobId}/`;

          if (visitedUrls.has(canonicalUrl)) {
            continue;
          }
          visitedUrls.add(canonicalUrl);

          // Extract title, company, location (prefer pane with card fallback)
          const paneTitleEl = await page.$(
            ".job-details-jobs-unified-top-card__job-title, h1.t-24"
          );
          const rawTitle = paneTitleEl ? (await paneTitleEl.innerText()).trim() : rawCardTitle;
          const title = rawTitle.replace(/\s+/g, " ").trim();

          const paneCompanyEl = await page.$(
            ".job-details-jobs-unified-top-card__company-name, [class*='topcard__org-name-link']"
          );
          const rawCompany = paneCompanyEl
            ? (await paneCompanyEl.innerText()).trim()
            : rawCardCompany;
          const company = rawCompany
            .replace(/\s*(logo|company logo)\s*$/i, "")
            .replace(/\s+/g, " ")
            .trim();

          const locationEl = await page.$(
            ".job-details-jobs-unified-top-card__primary-description-container span, [class*='topcard__flavor--bullet']"
          );
          const location = locationEl ? (await locationEl.innerText()).trim() : "";

          // Description
          const descEl = await page.$(
            "#job-details, .jobs-description-content__text, .jobs-box__html-content"
          );
          const description = descEl
            ? (await descEl.innerText()).replace(/\s+/g, " ").trim()
            : "";

          // Top Applicant Detection:
          // 1. From dedicated Top Applicant collection
          // 2. "You'd be a top applicant" badge on card
          // 3. Right-pane "Job match is high, we can help you stand out" / "match the required qualifications"
          const detailPaneEl = await page.$(
            ".jobs-search__job-details, .scaffold-layout__detail, .job-view-layout"
          );
          const detailPaneText = detailPaneEl
            ? await detailPaneEl.innerText().catch(() => "")
            : "";

          const isTopApplicant =
            isTopApplicantCollection ||
            cardText.toLowerCase().includes("top applicant") ||
            detailPaneText.toLowerCase().includes("top applicant") ||
            detailPaneText.toLowerCase().includes("match is high") ||
            detailPaneText.toLowerCase().includes("match the required qualifications");

          // Extract Hiring Team / Job Poster
          let jobPoster: LinkedInScrapedJob["jobPoster"] = null;

          const posterContainer = await page.$(
            "[class*='hirer-card'], [class*='hiring-team'], section:has-text('Meet the hiring team'), div:has-text('Meet the hiring team'), div:has-text('People you can reach out to')"
          );

          if (posterContainer) {
            try {
              const posterNameEl = await posterContainer.$(
                "a[href*='/in/'] strong, [class*='hirer-card__name'], h3, a[href*='/in/']"
              );
              const posterTitleEl = await posterContainer.$(
                "[class*='hirer-card__job-title'], [class*='hirer-card__headline'], .text-body-small"
              );
              const posterLinkEl = await posterContainer.$("a[href*='/in/']");

              const rawName = posterNameEl ? (await posterNameEl.innerText()).trim() : "";
              const cleanName = rawName
                .replace(/\s*(profile photo|photo)\s*$/i, "")
                .replace(/\s*·.*$/, "")
                .trim();

              const posterTitle = posterTitleEl
                ? (await posterTitleEl.innerText()).trim()
                : "Job Poster";
              const profileHref = posterLinkEl ? await posterLinkEl.getAttribute("href") : "";

              let formattedProfileUrl: string | undefined = undefined;
              if (profileHref) {
                const cleanHref = profileHref.split("?")[0];
                formattedProfileUrl = cleanHref.startsWith("http")
                  ? cleanHref
                  : `https://www.linkedin.com${cleanHref.startsWith("/") ? "" : "/"}${cleanHref}`;
              }

              if (cleanName && cleanName.length > 1) {
                jobPoster = {
                  name: cleanName,
                  title: posterTitle,
                  profileUrl: formattedProfileUrl,
                };
                log("👤", `Found Hiring Team: ${jobPoster.name} (${jobPoster.title})`);
              }
            } catch (e) {
              // ignore
            }
          }

          if (title && company) {
            // Strict Remote Filter:
            const locLower = location.toLowerCase();
            const cardLower = cardText.toLowerCase();
            const paneLower = detailPaneText.toLowerCase();
            const descLower = description.toLowerCase();

            const isExplicitlyInPerson =
              (locLower.includes("on-site") ||
                locLower.includes("in person") ||
                locLower.includes("in-person") ||
                paneLower.includes("on-site") ||
                paneLower.includes("in person") ||
                paneLower.includes("in-person") ||
                descLower.includes("location: on site") ||
                descLower.includes("work model: in person")) &&
              !locLower.includes("remote") &&
              !paneLower.includes("remote");

            const isRemote =
              locLower.includes("remote") ||
              paneLower.includes("remote") ||
              cardLower.includes("remote") ||
              descLower.includes("remote") ||
              descLower.includes("work from home") ||
              descLower.includes("work from anywhere");

            if (isExplicitlyInPerson || !isRemote) {
              log("🚫", `Skipping non-remote role: "${title}" at ${company} (${location || "In-person/On-site"})`);
              continue;
            }

            const topBadge = isTopApplicant ? " 🌟 [TOP APPLICANT]" : "";
            log(
              "🏢",
              `Extracted [${scrapedJobs.length + 1}/${maxJobs}]: "${title}" at ${company}${topBadge}`
            );

            scrapedJobs.push({
              title,
              company,
              location,
              url: canonicalUrl,
              description: description.slice(0, 3500),
              isTopApplicant,
              jobPoster,
            });
          }

          await delay(1200);
        } catch (cardError) {
          log("⚠️", `Error extracting card ${i}: ${cardError}`);
        }
      }
    }

    // Persist updated session
    await context.storageState({ path: STORAGE_STATE_PATH }).catch(() => null);

    log(
      "✅",
      `Successfully scraped ${scrapedJobs.length} jobs (${
        scrapedJobs.filter((j) => j.isTopApplicant).length
      } Top Applicant matches)`
    );
    return scrapedJobs;
  } catch (error) {
    log("❌", `LinkedIn scraper error: ${error}`);
    return scrapedJobs;
  } finally {
    await context.browser()?.close();
  }
}
