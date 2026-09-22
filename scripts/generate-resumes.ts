import { chromium } from "playwright";
import path from "path";
import fs from "fs";

interface ResumeData {
  title: string;
  outputFilename: string;
  summary: string;
  experience: {
    title: string;
    company: string;
    dates: string;
    bullets: { label: string; text: string }[];
  }[];
  projects: {
    title: string;
    subtitle?: string;
    bullets: { label: string; text: string }[];
    tech: string;
  }[];
  skills: {
    category: string;
    items: string;
  }[];
}

const fullstackResume: ResumeData = {
  title: "FULL-STACK & FRONTEND ENGINEER",
  outputFilename: "Bemnet Kibret - Full-Stack Engineer Resume.pdf",
  summary:
    "High-velocity Full-Stack & Frontend Engineer specializing in architecting responsive, accessible web applications and reliable end-to-end cloud platforms. Proven track record of building production web systems using TypeScript, Next.js (App Router, Server Components), React, and Tailwind CSS, backed by robust PostgreSQL and Node.js services. Experienced in reducing API response latency by ~35%, managing complex client/server state, and authoring rigorous Jest/Playwright test suites. Dedicated to shipping clean, high-performance user interfaces with zero-downtime full-stack execution.",
  experience: [
    {
      title: "Full-Stack Software Engineer",
      company: "Senselet (Enterprise SaaS Platform)",
      dates: "2024 – Present",
      bullets: [
        {
          label: "Modern Web Application Architecture",
          text: "Architected and launched responsive multi-tenant web application dashboards handling 10k+ SKUs and real-time inventory management across commercial retail clients, eliminating 20+ hours of weekly manual auditing.",
        },
        {
          label: "Frontend State & Real-Time Sync",
          text: "Engineered client-side state architectures using React Query and Zustand paired with Supabase real-time WebSockets; delivered optimistic UI updates, sub-second search filtering, and seamless offline-first caching.",
        },
        {
          label: "Full-Stack API Integration",
          text: "Built containerized Node.js and Python API services on AWS with PostgreSQL; authored strict schema migrations and Row-Level Security (RLS) ensuring 0% data corruption across multi-location warehouse operations.",
        },
        {
          label: "UI Performance & Design Systems",
          text: "Implemented modular component design systems using Next.js App Router, React 19, and Tailwind CSS, achieving 95+ Google Lighthouse scores across desktop and mobile devices.",
        },
        {
          label: "Feature Velocity & Testing",
          text: "Instituted automated end-to-end and component testing pipelines with Playwright and Jest in GitHub Actions CI/CD, maintaining rapid continuous deployment cycles.",
        },
      ],
    },
    {
      title: "Full-Stack Developer (Contract)",
      company: "Marvels Creative Technology",
      dates: "March 2025 – June 2025",
      bullets: [
        {
          label: "Next.js & API Optimization",
          text: "Architected and optimized 20+ RESTful API endpoints and Next.js server routes with TypeScript, slashing server response times by ~35% for enterprise client applications.",
        },
        {
          label: "Component Architecture & UX",
          text: "Developed dynamic, component-driven client interfaces with React, Next.js, and modern CSS; ensured cross-browser responsiveness, high accessibility (a11y), and intuitive UX flows.",
        },
        {
          label: "Database & Data Contracts",
          text: "Designed PostgreSQL schemas and Prisma ORM data models, establishing strict type-safe data contracts between client state and database with sub-100ms average query latency.",
        },
        {
          label: "Automated CI/CD & Reliability",
          text: "Authored comprehensive automated test suites using Jest and Postman within GitHub Actions, achieving 99.5%+ deployment stability across production rollouts.",
        },
      ],
    },
  ],
  projects: [
    {
      title: "AGY Web Cockpit & Real-Time Command Center",
      bullets: [
        {
          label: "Impact & Architecture",
          text: "Built a responsive, real-time command dashboard bridging WebSockets to autonomous coding agents; implemented live streaming responses, visual verification checkpoints with Playwright, and Cloudflare HTTPS tunneling.",
        },
      ],
      tech: "Next.js, React, TypeScript, Tailwind CSS, Playwright, WebSockets, Python, Cloudflare",
    },
    {
      title: "Automated Data Enrichment & Webhook Pipeline",
      bullets: [
        {
          label: "Impact & Retrieval Optimization",
          text: "Built and deployed a production data processing microservice indexing 5,000+ records with semantic vector embeddings and structured extraction, cutting per-record processing cost by ~65%.",
        },
      ],
      tech: "TypeScript, Next.js, Node.js, PostgreSQL, Vector Embeddings, REST APIs, Webhooks, AWS",
    },
  ],
  skills: [
    {
      category: "Languages & Core",
      items: "TypeScript, JavaScript (ES6+), HTML5, CSS3, Tailwind CSS, Python, SQL",
    },
    {
      category: "Frontend Frameworks",
      items: "React 18/19, Next.js (App Router, SSR, SSG, Server Components), Zustand, React Query, Three.js",
    },
    {
      category: "Backend & APIs",
      items: "Node.js, Next.js Route Handlers, Express, RESTful APIs, Supabase Edge Functions, Webhooks",
    },
    {
      category: "Databases & Cloud",
      items: "PostgreSQL, Supabase (RLS), Prisma ORM, AWS (ECS, Lambda), Docker, Vercel, Render",
    },
    {
      category: "Tooling & Workflows",
      items: "Git, GitHub Actions (CI/CD), Jest, Playwright, Postman, Vite, Linux, Cursor, Claude",
    },
  ],
};

const backendResume: ResumeData = {
  title: "BACKEND & SYSTEMS ENGINEER",
  outputFilename: "Bemnet Kibret - Backend Engineer Resume.pdf",
  summary:
    "Disciplined Backend & Systems Engineer specializing in relational database architecture, distributed microservices, and resilient cloud pipelines. Deep expertise in PostgreSQL (157 strict migrations, Row-Level Security, sub-100ms query plans), containerized Python/Node.js microservices on AWS (ECS, Lambda), and idempotent event-driven webhooks. Proven track record of designing fault-tolerant offline-first synchronization layers guaranteeing 0% data loss across distributed nodes. Passionate about system reliability, clean API boundaries, and automated CI/CD testing for high-concurrency environments.",
  experience: [
    {
      title: "Lead Backend & Systems Engineer",
      company: "Senselet (Enterprise SaaS Infrastructure)",
      dates: "2024 – Present",
      bullets: [
        {
          label: "Mission-Critical Database Architecture",
          text: "Architected an offline-first distributed data layer utilizing PostgreSQL Dual-ID resolution; authored 157 strict migrations with organization-scoped Row-Level Security (RLS) guaranteeing 0% data loss across 5+ warehouse nodes.",
        },
        {
          label: "High-Throughput Cloud Microservices",
          text: "Built containerized Python and Node.js microservices deployed on AWS (ECS & Lambda) with idempotent webhook ingestion handling sub-500ms execution latency and 99.9% deduplication reliability.",
        },
        {
          label: "Automated Decisioning Engines",
          text: "Engineered high-reliability automated inventory reorder and financial allocation calculation backends, cutting reconciliation turnaround from 45 minutes to <30 seconds with auditable transaction logs.",
        },
        {
          label: "High-Availability Infrastructure",
          text: "Implemented resilient failover routines, database connection pooling (Supabase / PgBouncer), automated backups, and structured logging across production client instances.",
        },
        {
          label: "Engineering Leadership & Schema Modeling",
          text: "Modeled complex enterprise entity-relationship schemas (10k+ active SKUs) while maintaining strict referential integrity, foreign key constraints, and index optimizations.",
        },
      ],
    },
    {
      title: "Backend Developer (Contract)",
      company: "Marvels Creative Technology",
      dates: "March 2025 – June 2025",
      bullets: [
        {
          label: "API & Microservice Optimization",
          text: "Architected and optimized 20+ RESTful API endpoints and server routes in TypeScript and Node.js, slashing server response latency by ~35% for high-traffic enterprise applications.",
        },
        {
          label: "PostgreSQL Schemas & Query Tuning",
          text: "Designed relational database schemas using Prisma ORM; optimized indexes, query execution plans, and join structures to achieve consistent sub-100ms latency.",
        },
        {
          label: "CI/CD & Automated Testing",
          text: "Authored comprehensive automated API integration test suites using Jest and Postman in GitHub Actions CI/CD pipelines, achieving 99.5%+ deployment stability.",
        },
        {
          label: "Security & Data Contracts",
          text: "Implemented strict request validation schemas (Zod), rate limiting, and JWT authentication middleware to safeguard client endpoints against abuse.",
        },
      ],
    },
  ],
  projects: [
    {
      title: "Automated Data Ingestion & Retrieval Pipeline",
      bullets: [
        {
          label: "Impact & Scale",
          text: "Built and deployed a production data processing microservice indexing 5,000+ records with semantic vector embeddings and structured extraction, cutting per-record processing cost by ~65%.",
        },
        {
          label: "System Reliability",
          text: "Engineered signature-verified webhook receivers, automated validation routines, and idempotent PostgreSQL persistence with transactional rollbacks.",
        },
      ],
      tech: "Python 3.12, Node.js, PostgreSQL, Vector Embeddings, REST APIs, Webhooks, AWS",
    },
    {
      title: "Distributed Agent Command Center & Tunneling Gateway",
      bullets: [
        {
          label: "Impact & Architecture",
          text: "Engineered a resilient headless worker daemon bridging messaging queues with remote execution nodes; integrated automated Playwright visual verification checkpoints, health checks, and dynamic Cloudflare HTTPS tunneling.",
        },
      ],
      tech: "Python, Docker, Cloudflare Tunneling, Playwright, Linux, REST APIs",
    },
  ],
  skills: [
    {
      category: "Languages & Core",
      items: "Python (3.11/3.12), TypeScript, JavaScript (Node.js), SQL, Bash / Shell",
    },
    {
      category: "Backend & APIs",
      items: "Node.js, Express, Fastify, Python (FastAPI), RESTful APIs, Webhooks, Idempotent Consumers, Microservices",
    },
    {
      category: "Databases & Caching",
      items: "PostgreSQL (RLS, Migrations, Index Tuning, Partitioning), Supabase, Prisma ORM, Redis, PgBouncer",
    },
    {
      category: "Cloud & DevOps",
      items: "AWS (ECS, Lambda, S3, CloudWatch), Docker, GitHub Actions (CI/CD), Render, Cloudflare, Linux Admin",
    },
    {
      category: "Testing & Tooling",
      items: "Jest, PyTest, Postman, Zod, Git, Cursor, Claude",
    },
  ],
};

function renderHTML(data: ResumeData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bemnet Kibret - ${data.title}</title>
  <style>
    @page {
      size: letter;
      margin: 11mm 13mm 10mm 13mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 8.8pt;
      line-height: 1.34;
      color: #1a1a1a;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    a {
      color: #1d4ed8;
      text-decoration: none;
    }
    .header {
      text-align: center;
      margin-bottom: 8px;
    }
    .header h1 {
      font-size: 21pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
      text-transform: uppercase;
    }
    .header .subtitle {
      font-size: 10.5pt;
      font-weight: 700;
      color: #1d4ed8;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .header .contact-bar {
      font-size: 8.5pt;
      color: #374151;
    }
    .header .contact-bar span {
      margin: 0 4px;
      color: #9ca3af;
    }
    .section {
      margin-bottom: 7px;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      border-bottom: 1.2px solid #0f172a;
      padding-bottom: 1.5px;
      margin-bottom: 4.5px;
    }
    .summary-text {
      font-size: 8.7pt;
      text-align: justify;
      line-height: 1.35;
      color: #1f2937;
    }
    .item {
      margin-bottom: 5.5px;
    }
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2px;
    }
    .item-title-wrap {
      font-size: 8.9pt;
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
      font-size: 8.5pt;
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
      padding-left: 13px;
      margin-bottom: 2.2px;
      font-size: 8.6pt;
      color: #1f2937;
      line-height: 1.32;
    }
    ul.bullet-list li::before {
      content: "•";
      position: absolute;
      left: 3px;
      top: 0;
      font-size: 9pt;
      color: #374151;
    }
    ul.bullet-list li strong {
      color: #0f172a;
      font-weight: 650;
    }
    .project-item {
      margin-bottom: 4.5px;
    }
    .project-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 1.5px;
    }
    .project-title {
      font-weight: 700;
      font-size: 8.9pt;
      color: #111827;
    }
    .tech-line {
      font-size: 8.3pt;
      color: #374151;
      margin-top: 1.5px;
      padding-left: 13px;
    }
    .tech-line strong {
      color: #0f172a;
      font-weight: 650;
    }
    .skills-grid {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .skill-row {
      font-size: 8.5pt;
      line-height: 1.32;
      color: #1f2937;
    }
    .skill-category {
      font-weight: 700;
      color: #0f172a;
      display: inline-block;
      min-width: 135px;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <h1>Bemnet Kibret</h1>
    <div class="subtitle">${data.title}</div>
    <div class="contact-bar">
      <a href="mailto:bemnetkibret4@gmail.com">bemnetkibret4@gmail.com</a>
      <span>•</span>
      <a href="tel:+251929177999">+251 929 177 999</a>
      <span>•</span>
      Addis Ababa, Ethiopia (100% Remote)
      <span>•</span>
      <a href="https://github.com/Bemkin" target="_blank">GitHub</a>
      <span>•</span>
      <a href="https://www.linkedin.com/in/bemnet-kibret-054a792a9/" target="_blank">LinkedIn</a>
      <span>•</span>
      <a href="https://my-portfolio-theta-flame-45.vercel.app" target="_blank">Portfolio</a>
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
    <div class="section-title">Key Projects & Systems</div>
    ${data.projects
      .map(
        (proj) => `
      <div class="project-item">
        <div class="project-header">
          <span class="project-title">${proj.title}</span>
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
        <div class="tech-line"><strong>Tech:</strong> ${proj.tech}</div>
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

</body>
</html>`;
}

async function generatePDF(data: ResumeData) {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();
  const html = renderHTML(data);
  await page.setContent(html, { waitUntil: "networkidle" });

  const outputPath = path.join(__dirname, "..", data.outputFilename);
  await page.pdf({
    path: outputPath,
    format: "letter",
    printBackground: true,
    margin: {
      top: "10mm",
      right: "12mm",
      bottom: "10mm",
      left: "12mm",
    },
  });

  await browser.close();
  console.log(`✅ Generated: ${data.outputFilename}`);
}

async function main() {
  console.log("Generating tailored CVs with Playwright...");
  await generatePDF(fullstackResume);
  await generatePDF(backendResume);
  console.log("All tailored CVs generated successfully!");
}

main().catch((err) => {
  console.error("Error generating CVs:", err);
  process.exit(1);
});
