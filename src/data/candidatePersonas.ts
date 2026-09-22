import path from "path";
import fs from "fs";

export type CandidateTrackKey = "fullstack" | "backend" | "ai_founding";

export interface CandidatePersona {
  key: CandidateTrackKey;
  displayName: string;
  badgeName: string;
  titleInSignature: string;
  primaryResumeFilename: string;
  fallbackResumeFilename: string;
  candidateContext: string;
  pitchGuidance: string;
  buildSubject: (jobTitle: string, company: string) => string;
}

const DEFAULT_RESUME = "Bemnet Kibret - Founding Full-Stack Engineer Resume.pdf";

export const CANDIDATE_PERSONAS: Record<CandidateTrackKey, CandidatePersona> = {
  fullstack: {
    key: "fullstack",
    displayName: "Full-Stack & Frontend Engineer",
    badgeName: "🎨 Full-Stack & Frontend",
    titleInSignature: "Full-Stack & Frontend Engineer",
    primaryResumeFilename: "Bemnet Kibret - Full-Stack Engineer Resume.pdf",
    fallbackResumeFilename: DEFAULT_RESUME,
    candidateContext: `I am Bemnet Kibret, a production Full-Stack & Frontend Engineer with extensive experience building fast, accessible web applications and reliable full-stack systems using TypeScript, Next.js, and React.

Key Highlights & Track Record:
• Frontend & Full-Stack at Marvels Creative Technology: Architected and optimized 20+ Next.js server routes and RESTful API endpoints (TypeScript, Next.js App Router), reducing response latency by ~35%. Designed responsive, component-driven web interfaces, automated CI/CD API testing with Jest, and ensured sub-100ms database interactions.
• Production Web Engineering at Senselet: Architected and launched full-stack web applications handling 10k+ SKUs and multi-client workflows; designed clean client/server component boundaries, optimistic UI updates, and real-time state synchronization with Supabase and WebSockets.
• Modern Frontend Stack: Deep expertise in React 18/19, Next.js (App Router, Server Components, SSR, SSG), TypeScript, Tailwind CSS, State Management (Zustand, React Query), and modern bundlers/tooling.
• End-to-End Delivery: Bridges modern UI engineering with resilient backends (PostgreSQL, Prisma, Node.js, REST & GraphQL APIs), maintaining 0% downtime and rigorous test coverage.

Core Tech Stack:
TypeScript, Next.js, React, JavaScript, Tailwind CSS, HTML5/CSS3, Node.js, PostgreSQL, Supabase, Prisma ORM, REST APIs, Git, Docker, Jest.`,
    pitchGuidance: `Write as an energetic, hands-on Full-Stack & Frontend Engineer who delivers fast, polished user experiences and robust APIs. Emphasize clean TypeScript, UI performance, Next.js / React expertise, and reliable feature velocity. Do NOT pitch as a startup founder or overqualified executive. Keep the tone grounded, collaborative, and focused on immediate engineering execution.`,
    buildSubject: (jobTitle: string, company: string) => {
      const t = jobTitle.toLowerCase();
      if (t.includes("frontend") || t.includes("front-end") || t.includes("react") || t.includes("ui")) {
        return `Frontend Engineer Application — Bemnet Kibret`;
      }
      if (t.includes("full-stack") || t.includes("fullstack") || t.includes("full stack")) {
        return `Full-Stack Engineer Application — Bemnet Kibret`;
      }
      return `Software Engineer Application — Bemnet Kibret`;
    },
  },

  backend: {
    key: "backend",
    displayName: "Backend & Systems Engineer",
    badgeName: "⚙️ Backend & Systems",
    titleInSignature: "Backend & Systems Engineer",
    primaryResumeFilename: "Bemnet Kibret - Backend Engineer Resume.pdf",
    fallbackResumeFilename: DEFAULT_RESUME,
    candidateContext: `I am Bemnet Kibret, a Backend & Systems Engineer specializing in high-throughput APIs, mission-critical relational database architecture, and distributed cloud microservices.

Key Highlights & Track Record:
• Mission-Critical Data Integrity: Designed an offline-first distributed architecture with a Dual-ID resolution layer in PostgreSQL; authored 157 strict migrations with organization-scoped Row-Level Security (RLS) ensuring 0% data loss across multi-location deployments.
• Cloud Microservices & Scalable Pipelines: Engineered containerized Python and Node.js microservices on AWS (ECS & Lambda) with idempotent webhook ingestion handling sub-500ms execution latency and 99.9% deduplication reliability.
• API Optimization at Marvels Creative Technology: Architected 20+ RESTful API endpoints with Prisma ORM and PostgreSQL; tuned query execution plans and indexing strategies to achieve sub-100ms query latency, and instituted automated Jest test suites.
• Production Infrastructure & Reliability: Extensive experience with Docker containerization, AWS cloud services, PostgreSQL performance tuning, caching strategies (Redis), and secure authentication architectures.

Core Tech Stack:
PostgreSQL (RLS, Migrations, Indexing), TypeScript, Node.js, Python, AWS (ECS, Lambda, S3), Docker, Prisma ORM, Supabase, RESTful APIs, Webhooks, CI/CD, Jest, Linux.`,
    pitchGuidance: `Write as a disciplined, detail-oriented Backend & Systems Engineer who cares deeply about database integrity, query efficiency, idempotent services, and reliable system architecture. Emphasize PostgreSQL (157 migrations, sub-100ms latency), AWS cloud services, and clean API design. Do NOT pitch as a startup founder. Keep the tone focused on technical reliability, scalability, and craftsmanship.`,
    buildSubject: (jobTitle: string, company: string) => {
      const t = jobTitle.toLowerCase();
      if (t.includes("backend") || t.includes("back-end") || t.includes("back end")) {
        return `Backend Engineer Application — Bemnet Kibret`;
      }
      return `Backend / Systems Engineer Application — Bemnet Kibret`;
    },
  },

  ai_founding: {
    key: "ai_founding",
    displayName: "Founding & Applied AI Engineer",
    badgeName: "🚀 Founding & Applied AI",
    titleInSignature: "Founding Engineer & Applied AI Lead | Founder, Senselet",
    primaryResumeFilename: "Bemnet Kibret - Founding Full-Stack Engineer Resume.pdf",
    fallbackResumeFilename: DEFAULT_RESUME,
    candidateContext: `I am Bemnet Kibret, a high-agency Founding Full-Stack & Applied AI Engineer specializing in taking complex, AI-native platforms from zero to production.

Key Highlights & Track Record:
• Founder & Lead Engineer at Senselet: Architected and deployed an AI-native enterprise ERP from the ground up on AWS and Supabase, scaling across 3+ commercial retail clients to eliminate 20+ hours of weekly manual auditing across 10k+ active SKUs.
• High-Stakes Decisioning & Agentic AI: Engineered a proprietary 15-tool agentic backend using native JSON-schema function calling and cascading LLM failover; automated 90%+ of routine reorder and financial allocation decisions, cutting turnaround from 45 min to <30 sec.
• Automated Data Enrichment RAG Pipeline: Built high-accuracy semantic search indexing across 5,000+ records achieving 99.2% extraction accuracy; deployed autonomous agent command centers with Playwright visual checkpoints and real-time streaming.
• Mission-Critical Full-Stack Systems: Designed offline-first PostgreSQL architecture with 157 strict migrations, dual-ID sync, sub-100ms APIs, and AWS Lambda/ECS microservices.

Core Tech Stack:
Agentic AI, LLMs, Function Calling, RAG, Vector Search, TypeScript, Next.js, Node.js, Python, PostgreSQL, Supabase, AWS (ECS, Lambda), Docker, Playwright.`,
    pitchGuidance: `Write with high-agency founder authority. Highlight 0-to-1 velocity, business outcome impact, production agentic architectures, and taking complex AI/full-stack systems from scratch to commercial scale.`,
    buildSubject: (jobTitle: string, company: string) => {
      const t = jobTitle.toLowerCase();
      if (t.includes("ai") || t.includes("agentic") || t.includes("llm") || t.includes("machine learning")) {
        return `AI Engineer Application — Bemnet Kibret`;
      }
      return `Founding Engineer Application — Bemnet Kibret`;
    },
  },
};

export function detectCandidateTrack(title: string, description: string): CandidatePersona {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  // 1. Explicit AI / Founding in title has highest priority for Track 3
  const isFoundingOrAI =
    /\b(founding|founder|applied ai|ai engineer|agentic|llm|genai|machine learning|generative ai)\b/i.test(
      titleLower
    );

  if (isFoundingOrAI) {
    return CANDIDATE_PERSONAS.ai_founding;
  }

  // 2. Title-specific frontend checks -> Track 1
  const isFrontendTitle =
    /\b(frontend|front-end|front end|react|ui|web developer|web engineer)\b/i.test(titleLower);
  const isFullstackTitle = /\b(full[- ]?stack|fullstack)\b/i.test(titleLower);

  if (isFrontendTitle) {
    return CANDIDATE_PERSONAS.fullstack;
  }

  // 3. Title-specific backend checks -> Track 2
  const isBackendTitle =
    /\b(backend|back-end|back end|systems?|platform|infrastructure|devops|database|data engineer)\b/i.test(
      titleLower
    );

  if (isBackendTitle) {
    return CANDIDATE_PERSONAS.backend;
  }

  if (isFullstackTitle) {
    // If it heavily mentions AI/RAG in description, route to ai_founding
    const aiMentions = (
      descLower.match(
        /\b(agentic|rag|llm|langchain|openai|gemini|anthropic|vector search|embeddings)\b/g
      ) || []
    ).length;
    if (aiMentions >= 3) {
      return CANDIDATE_PERSONAS.ai_founding;
    }
    return CANDIDATE_PERSONAS.fullstack;
  }

  // 4. Generic titles (e.g. "Software Engineer", "Software Developer", "Product Engineer")
  const aiScore = (
    descLower.match(
      /\b(agentic|rag|llm|generative ai|artificial intelligence|vector database|embeddings|prompt)\b/g
    ) || []
  ).length;
  const backendScore = (
    descLower.match(
      /\b(backend|postgres|sql|database|distributed|microservice|aws|lambda|ecs|docker|redis|api design|rest api)\b/g
    ) || []
  ).length;
  const frontendScore = (
    descLower.match(
      /\b(frontend|react|next\.?js|ui|ux|css|tailwind|html|client-side|web application)\b/g
    ) || []
  ).length;

  if (aiScore >= 3 && aiScore > backendScore && aiScore > frontendScore) {
    return CANDIDATE_PERSONAS.ai_founding;
  }

  if (backendScore > frontendScore) {
    return CANDIDATE_PERSONAS.backend;
  }

  return CANDIDATE_PERSONAS.fullstack;
}

export function buildSenderSignature(persona: CandidatePersona): string {
  return `Best regards,
Bemnet Kibret
${persona.titleInSignature}
GitHub: https://github.com/Bemkin
LinkedIn: https://www.linkedin.com/in/bemnet-kibret-054a792a9/
Portfolio: https://my-portfolio-theta-flame-45.vercel.app
Live CV: https://my-portfolio-theta-flame-45.vercel.app/resume`;
}

export function getResumeForPersona(
  persona: CandidatePersona,
  baseDir: string
): { filename: string; path: string } {
  const primaryPath = path.join(baseDir, persona.primaryResumeFilename);
  if (fs.existsSync(primaryPath)) {
    return { filename: persona.primaryResumeFilename, path: primaryPath };
  }

  const fallbackPath = path.join(baseDir, persona.fallbackResumeFilename);
  if (fs.existsSync(fallbackPath)) {
    return { filename: persona.fallbackResumeFilename, path: fallbackPath };
  }

  return { filename: DEFAULT_RESUME, path: path.join(baseDir, DEFAULT_RESUME) };
}
