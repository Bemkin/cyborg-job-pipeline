import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { getProfileDir } from "../src/profile";

// Renders the resumes described in PROFILE_DIR/resumes.json to PDFs in PROFILE_DIR.
// See examples/profile/resumes.json for the format.

interface ResumeHeader {
  name: string;
  /** Shown in the contact bar, separated by "|"; entries with a url become links */
  contact: { text: string; url?: string }[];
}

interface ResumeData {
  title: string;
  outputFilename: string;
  summary: string;
  experience: {
    title: string;
    company: string;
    companyBadge?: { label: string; url: string };
    dates: string;
    bullets: { label: string; text: string }[];
  }[];
  projects: {
    title: string;
    badge?: { label: string; url: string };
    bullets: { label: string; text: string }[];
    tech: string;
  }[];
  skills: {
    category: string;
    items: string;
  }[];
  education: {
    institution: string;
    credential: string;
    credentialUrl?: string;
    dates: string;
    location: string;
  }[];
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderContactBar(header: ResumeHeader): string {
  return header.contact
    .map((c) => {
      if (!c.url) return escapeHtml(c.text);
      const external = /^https?:/i.test(c.url) ? ' target="_blank"' : "";
      return `<a href="${escapeHtml(c.url)}"${external}>${escapeHtml(c.text)}</a>`;
    })
    .join("\n      <span>|</span>\n      ");
}

function renderHTML(data: ResumeData, header: ResumeHeader): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(header.name)} - ${data.title}</title>
  <style>
    @page {
      size: letter;
      margin: 8mm 11.5mm 8mm 11.5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 8.4pt;
      line-height: 1.28;
      color: #1a1a1a;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    a {
      color: #1d4ed8;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .badge-link {
      color: #1d4ed8;
      font-size: 8.0pt;
      font-weight: 500;
      text-decoration: none;
      margin-left: 2px;
    }
    .edu-link {
      color: #1d4ed8;
      font-weight: 500;
      text-decoration: none;
    }
    .header {
      text-align: center;
      margin-bottom: 5px;
    }
    .header h1 {
      font-size: 19.5pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
      margin-bottom: 1.5px;
      text-transform: uppercase;
    }
    .header .subtitle {
      font-size: 9.6pt;
      font-weight: 700;
      color: #1d4ed8;
      letter-spacing: 1.1px;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .header .contact-bar {
      font-size: 8.15pt;
      color: #374151;
    }
    .header .contact-bar span {
      margin: 0 4px;
      color: #9ca3af;
    }
    .section {
      margin-bottom: 4.5px;
    }
    .section-title {
      font-size: 8.9pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      border-bottom: 1.2px solid #0f172a;
      padding-bottom: 1px;
      margin-bottom: 3px;
    }
    .summary-text {
      font-size: 8.3pt;
      text-align: justify;
      line-height: 1.27;
      color: #1f2937;
    }
    .item {
      margin-bottom: 3.5px;
    }
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 1px;
    }
    .item-title-wrap {
      font-size: 8.45pt;
      color: #111827;
    }
    .item-title {
      font-weight: 700;
    }
    .item-company {
      font-weight: 500;
      color: #374151;
    }
    .item-date {
      font-size: 8.15pt;
      font-weight: 600;
      color: #374151;
      white-space: nowrap;
    }
    ul.bullet-list {
      list-style-type: none;
      padding-left: 0;
    }
    ul.bullet-list li {
      position: relative;
      padding-left: 11px;
      margin-bottom: 1.4px;
      font-size: 8.15pt;
      color: #1f2937;
      line-height: 1.25;
    }
    ul.bullet-list li::before {
      content: "•";
      position: absolute;
      left: 2px;
      top: 0;
      font-size: 8.5pt;
      color: #374151;
    }
    ul.bullet-list li strong {
      color: #0f172a;
      font-weight: 650;
    }
    .project-item {
      margin-bottom: 3.5px;
    }
    .project-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 1.2px;
    }
    .project-title {
      font-weight: 700;
      font-size: 8.45pt;
      color: #111827;
    }
    .project-tech-header {
      font-size: 8.0pt;
      color: #374151;
      font-weight: 500;
      white-space: nowrap;
    }
    .skills-grid {
      display: flex;
      flex-direction: column;
      gap: 1.2px;
    }
    .skill-row {
      font-size: 8.15pt;
      line-height: 1.25;
      color: #1f2937;
    }
    .skill-category {
      font-weight: 700;
      color: #0f172a;
      display: inline-block;
      min-width: 125px;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <h1>${escapeHtml(header.name)}</h1>
    <div class="subtitle">${data.title}</div>
    <div class="contact-bar">
      ${renderContactBar(header)}
    </div>
  </div>

  <!-- SUMMARY -->
  <div class="section">
    <div class="section-title">Professional Summary</div>
    <div class="summary-text">${data.summary}</div>
  </div>

  <!-- EXPERIENCE -->
  <div class="section">
    <div class="section-title">Experience</div>
    ${data.experience
      .map(
        (exp) => `
      <div class="item">
        <div class="item-header">
          <div class="item-title-wrap">
            <span class="item-title">${exp.title}</span> | <span class="item-company">${exp.company}</span>
            ${
              exp.companyBadge
                ? `<a href="${exp.companyBadge.url}" target="_blank" class="badge-link">[${exp.companyBadge.label}]</a>`
                : ""
            }
          </div>
          <div class="item-date">${exp.dates}</div>
        </div>
        <ul class="bullet-list">
          ${exp.bullets
            .map(
              (b) => `
            <li><strong>${b.label}:</strong> ${b.text}</li>
          `
            )
            .join("")}
        </ul>
      </div>
    `
      )
      .join("")}
  </div>

  <!-- PROJECTS -->
  <div class="section">
    <div class="section-title">Key Projects</div>
    ${data.projects
      .map(
        (proj) => `
      <div class="project-item">
        <div class="project-header">
          <div>
            <span class="project-title">${proj.title}</span>
            ${
              proj.badge
                ? `<a href="${proj.badge.url}" target="_blank" class="badge-link">[${proj.badge.label}]</a>`
                : ""
            }
          </div>
          <div class="project-tech-header">${proj.tech}</div>
        </div>
        <ul class="bullet-list">
          ${proj.bullets
            .map(
              (b) => `
            <li><strong>${b.label}:</strong> ${b.text}</li>
          `
            )
            .join("")}
        </ul>
      </div>
    `
      )
      .join("")}
  </div>

  <!-- TECHNICAL SKILLS -->
  <div class="section">
    <div class="section-title">Technical Skills</div>
    <div class="skills-grid">
      ${data.skills
        .map(
          (s) => `
        <div class="skill-row">
          <span class="skill-category">${s.category}:</span> ${s.items}
        </div>
      `
        )
        .join("")}
    </div>
  </div>

  <!-- EDUCATION -->
  <div class="section">
    <div class="section-title">Education</div>
    ${data.education
      .map(
        (edu) => `
      <div class="item-header" style="margin-bottom: 1.5px;">
        <div class="item-title-wrap">
          <span class="item-title">${edu.institution}</span> | 
          ${
            edu.credentialUrl
              ? `<a href="${edu.credentialUrl}" target="_blank" class="edu-link">${edu.credential}</a>`
              : `<span>${edu.credential}</span>`
          }
        </div>
        <div class="item-date">${edu.dates} | ${edu.location}</div>
      </div>
    `
      )
      .join("")}
  </div>

</body>
</html>`;
}

async function generatePDF(data: ResumeData, header: ResumeHeader, outDir: string) {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();
  const html = renderHTML(data, header);
  await page.setContent(html, { waitUntil: "networkidle" });

  const outputPath = path.join(outDir, path.basename(data.outputFilename));
  await page.pdf({
    path: outputPath,
    format: "letter",
    printBackground: true,
    margin: {
      top: "7.5mm",
      right: "11mm",
      bottom: "7.5mm",
      left: "11mm",
    },
  });

  await browser.close();
  console.log(`✅ Generated: ${data.outputFilename}`);
}

async function main() {
  const profileDir = getProfileDir();
  const dataPath = path.join(profileDir, "resumes.json");
  if (!fs.existsSync(dataPath)) {
    throw new Error(`No resume data at ${dataPath}. Copy examples/profile/resumes.json there to get started.`);
  }
  const { header, resumes } = JSON.parse(fs.readFileSync(dataPath, "utf-8")) as {
    header: ResumeHeader;
    resumes: ResumeData[];
  };

  console.log("Generating tailored CVs with Playwright...");
  for (const resume of resumes) {
    await generatePDF(resume, header, profileDir);
  }
  console.log("All tailored CVs generated successfully!");
}

main().catch((err) => {
  console.error("Error generating CVs:", err);
  process.exit(1);
});
