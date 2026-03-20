FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./
# Install all dependencies (including devDependencies) for the build
RUN pnpm install --no-frozen-lockfile

COPY . .
# Compile TypeScript to JavaScript
RUN pnpm run build

FROM node:20-slim AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Chromium + fonts for puppeteer headless PDF generation.
# node:20-slim is Debian-based so we use apt.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-noto \
        ca-certificates \
        libgbm1 \
        libnss3 \
        libatk-bridge2.0-0 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to use the system Chromium rather than downloading its own.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
# Install ONLY production dependencies (devDependencies are excluded)
RUN pnpm install --prod --no-frozen-lockfile

COPY --from=builder /app/dist ./dist
# Copy the HTML template so it is available at runtime
COPY pdf_template ./pdf_template

EXPOSE 8080
# Run the compiled JavaScript, NOT ts-node-dev
CMD ["node", "dist/index.js"]
