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
 * Helper to extract hiring team poster info from an active page
 */
async function extractHiringTeam(page: Page): Promise<LinkedInScrapedJob["jobPoster"]> {
  try {
    const posterContainer = await page.$(
      "[class*='hirer-card'], [class*='hiring-team'], .jobs-poster, section[class*='hiring-team']"
    );

    if (!posterContainer) return null;

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

    if (cleanName && cleanName.length > 1 && !cleanName.toLowerCase().includes("top applicant")) {
      return {
        name: cleanName,
        title: posterTitle,
        profileUrl: formattedProfileUrl,
      };
    }
  } catch {
    return null;
  }
  return null;
}

interface RawCard {
  id: string;
  title: string;
  company: string;
  location: string;
  isTopApplicant: boolean;
  rawText: string;
}

/**
 * Scrapes recommended & top applicant remote jobs from LinkedIn
 */
export async function scrapeLinkedInRecommendedJobs(
  maxJobs = 20,
  forceLogin = false
): Promise<LinkedInScrapedJob[]> {
  const { context } = await getLinkedInContext(forceLogin);
  const page = await context.newPage();

  const scrapedJobs: LinkedInScrapedJob[] = [];
  const visitedUrls = new Set<string>();

  // Feeds: Top Applicant + Recommended + Active Keyword Searches for the 3 target CV tracks
  const targetFeeds = [
    {
      name: "Top Applicant (Remote)",
      url: "https://www.linkedin.com/jobs/collections/top-applicant/?f_WT=2",
      isTopApplicantCollection: true,
      maxFromThisFeed: 4,
    },
    {
      name: "Recommended (Remote)",
      url: "https://www.linkedin.com/jobs/collections/recommended/?f_WT=2",
      isTopApplicantCollection: false,
      maxFromThisFeed: 4,
    },
    {
      name: "Full-Stack Track (Remote)",
      url: "https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Engineer%20OR%20Frontend%20Developer&f_WT=2&sortBy=DD",
      isTopApplicantCollection: false,
      maxFromThisFeed: 5,
    },
    {
      name: "Backend Track (Remote)",
      url: "https://www.linkedin.com/jobs/search/?keywords=Backend%20Engineer%20OR%20Node.js%20Developer&f_WT=2&sortBy=DD",
      isTopApplicantCollection: false,
      maxFromThisFeed: 5,
    },
    {
      name: "Founding & AI Track (Remote)",
      url: "https://www.linkedin.com/jobs/search/?keywords=Founding%20Engineer%20OR%20AI%20Engineer&f_WT=2&sortBy=DD",
      isTopApplicantCollection: false,
      maxFromThisFeed: 5,
    },
  ];

  try {
    for (const feed of targetFeeds) {
      if (scrapedJobs.length >= maxJobs) break;

      log("🌐", `Navigating to LinkedIn: ${feed.name}...`);

      await page.goto(feed.url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      }).catch((e) => log("⚠️", `Navigation notice: ${e.message}`));

      await delay(2500);

      // Verify login status
      if (page.url().includes("/login") || page.url().includes("/authwall")) {
        log("⚠️", "LinkedIn session expired or redirected to authwall. Triggering re-login...");
        await context.browser()?.close();
        return scrapeLinkedInRecommendedJobs(maxJobs, true);
      }

      // Wait for card container
      await page.waitForSelector(
        "ul.scaffold-layout__list-container, .jobs-search-results-list, [data-job-id], [data-occludable-job-id], .job-card-container",
        { timeout: 10000 }
      ).catch(() => null);

      // Scroll left panel smoothly to render virtualized items
      await page.evaluate(async () => {
        const scrollable =
          document.querySelector(".jobs-search-results-list") ||
          document.querySelector(".scaffold-layout__list") ||
          document.querySelector("ul.scaffold-layout__list-container") ||
          window;
        for (let s = 0; s < 3; s++) {
          scrollable.scrollBy(0, 600);
          await new Promise((r) => setTimeout(r, 400));
        }
      });

      // Extract all card summaries from the DOM
      const rawCards: RawCard[] = await page.$$eval(
        "li[data-occludable-job-id], div[data-job-id], li.jobs-search-results__list-item, div.job-card-container",
        (elements) => {
          return elements
            .map((el) => {
              const idAttr =
                el.getAttribute("data-job-id") ||
                el.getAttribute("data-occludable-job-id");

              const linkEl = el.querySelector(
                "a[href*='/jobs/view/'], a.job-card-list__title, a.job-card-container__link"
              );
              const href = linkEl?.getAttribute("href") || "";
              const m = href.match(/\/jobs\/view\/(\d+)/);
              const id = idAttr || (m ? m[1] : null);

              const titleEl = el.querySelector(
                "a.job-card-list__title, [class*='job-card-list__title'], .artdeco-entity-lockup__title a, h3, strong"
              );
              const title = titleEl?.textContent?.replace(/\s+/g, " ")?.trim() || "";

              const compEl = el.querySelector(
                "[class*='primary-description'], [class*='company-name'], .artdeco-entity-lockup__subtitle"
              );
              const company = compEl?.textContent
                ?.replace(/\s*(logo|company logo)\s*$/i, "")
                ?.replace(/\s+/g, " ")
                ?.trim() || "";

              const locEl = el.querySelector(
                "[class*='metadata-item'], [class*='location'], [class*='bullet']"
              );
              const location = locEl?.textContent?.replace(/\s+/g, " ")?.trim() || "";

              const rawText = (el as HTMLElement).innerText || "";
              const isTop = rawText.toLowerCase().includes("top applicant");

              return {
                id,
                title,
                company,
                location,
                isTopApplicant: isTop,
                rawText,
              };
            })
            .filter((item): item is RawCard => Boolean(item.id && item.title && item.company));
        }
      );

      // Deduplicate cards by job ID
      const uniqueCards: RawCard[] = [];
      const seenBatchIds = new Set<string>();
      for (const card of rawCards) {
        if (!seenBatchIds.has(card.id)) {
          seenBatchIds.add(card.id);
          uniqueCards.push(card);
        }
      }

      log("📋", `Found ${uniqueCards.length} unique job cards in this view.`);

      let feedExtractedCount = 0;
      for (let i = 0; i < uniqueCards.length; i++) {
        if (scrapedJobs.length >= maxJobs) break;
        if (feedExtractedCount >= feed.maxFromThisFeed) {
          log("ℹ️", `Reached feed limit (${feed.maxFromThisFeed} jobs) for ${feed.name}`);
          break;
        }

        const card = uniqueCards[i];
        const canonicalUrl = `https://www.linkedin.com/jobs/view/${card.id}/`;

        if (visitedUrls.has(canonicalUrl)) {
          continue;
        }
        visitedUrls.add(canonicalUrl);

        // Pre-filter: Explicit On-Site / In-Person
        const locLower = card.location.toLowerCase();
        const textLower = card.rawText.toLowerCase();
        const isExplicitlyInPerson =
          (locLower.includes("on-site") ||
            locLower.includes("in person") ||
            locLower.includes("in-person")) &&
          !locLower.includes("remote") &&
          !textLower.includes("remote");

        if (isExplicitlyInPerson) {
          log("🚫", `Skipping on-site role: "${card.title}" at ${card.company} (${card.location})`);
          continue;
        }

        // Click the card's specific title link to load details in right pane
        const cardSelector = `a[href*='/jobs/view/${card.id}'], [data-job-id='${card.id}'] a, [data-occludable-job-id='${card.id}'] a`;
        const cardLocator = page.locator(cardSelector).first();

        let description = "";
        let jobPoster: LinkedInScrapedJob["jobPoster"] = null;

        try {
          if (await cardLocator.isVisible({ timeout: 1500 }).catch(() => false)) {
            await cardLocator.click({ timeout: 2500 }).catch(() => null);
            await delay(1200);

            // Extract description from the right pane
            const descEl = await page.$(
              "#job-details, .jobs-description-content__text, .jobs-box__html-content"
            );
            if (descEl) {
              description = (await descEl.innerText()).replace(/\s+/g, " ").trim();
            }

            jobPoster = await extractHiringTeam(page);
          }

          // Fallback: If description wasn't loaded by click, load the standalone job view
          if (!description || description.length < 50) {
            const tempPage = await context.newPage();
            try {
              await tempPage.goto(canonicalUrl, {
                waitUntil: "domcontentloaded",
                timeout: 12000,
              });
              await delay(1000);

              const descEl = await tempPage.$(
                "#job-details, .jobs-description-content__text, .jobs-box__html-content"
              );
              if (descEl) {
                description = (await descEl.innerText()).replace(/\s+/g, " ").trim();
              }
              jobPoster = await extractHiringTeam(tempPage);
            } catch {
              // fallback ignore
            } finally {
              await tempPage.close().catch(() => null);
            }
          }

          if (jobPoster) {
            log("👤", `Found Hiring Team: ${jobPoster.name} (${jobPoster.title})`);
          }

          // Strict Remote Verification on full description and location
          const descLower = description.toLowerCase();
          const isFullInPerson =
            (locLower.includes("on-site") ||
              locLower.includes("in person") ||
              locLower.includes("in-person") ||
              descLower.includes("work model: in person") ||
              descLower.includes("location: on site")) &&
            !locLower.includes("remote") &&
            !descLower.includes("remote");

          const isRemote =
            locLower.includes("remote") ||
            descLower.includes("remote") ||
            descLower.includes("work from home") ||
            descLower.includes("work from anywhere");

          if (isFullInPerson || !isRemote) {
            log(
              "🚫",
              `Skipping non-remote role: "${card.title}" at ${card.company} (${
                card.location || "In-person/On-site"
              })`
            );
            continue;
          }

          const isTop = card.isTopApplicant || feed.isTopApplicantCollection;
          const topBadge = isTop ? " 🌟 [TOP APPLICANT]" : "";

          log(
            "🏢",
            `Extracted [${scrapedJobs.length + 1}/${maxJobs}]: "${card.title}" at ${
              card.company
            }${topBadge}`
          );

          scrapedJobs.push({
            title: card.title,
            company: card.company,
            location: card.location,
            url: canonicalUrl,
            description: description.slice(0, 3500),
            isTopApplicant: isTop,
            jobPoster,
          });

          feedExtractedCount++;
          await delay(800);
        } catch (err) {
          log("⚠️", `Error processing card ${card.id}: ${err}`);
        }
      }
    }

    // Persist updated session
    await context.storageState({ path: STORAGE_STATE_PATH }).catch(() => null);

    log(
      "✅",
      `Successfully scraped ${scrapedJobs.length} remote jobs (${
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
