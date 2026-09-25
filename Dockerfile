# ─────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for Cyborg Telegram Bot Daemon
# Optimized for Render Free Tier Web Service
# ─────────────────────────────────────────────────────────────

# Stage 1: Build TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Skip downloading heavy Playwright Chromium binaries during build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Stage 2: Lean Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=10000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript output
COPY --from=builder /app/dist ./dist

# Copy candidate persona PDF resumes for cold email attachment
COPY ["Bemnet Kibret - Backend Engineer Resume.pdf", "./"]
COPY ["Bemnet Kibret - Founding Full-Stack Engineer Resume.pdf", "./"]
COPY ["Bemnet Kibret - Full-Stack Engineer Resume.pdf", "./"]

# Initialize empty drafts cache (drafts are populated dynamically via sync API)
RUN echo "[]" > drafts_cache.json

# Expose Render web service port
EXPOSE 10000

# Healthcheck to verify the web service is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-10000}/health || exit 1

# Launch the daemon
CMD ["node", "dist/bot-daemon.js"]
