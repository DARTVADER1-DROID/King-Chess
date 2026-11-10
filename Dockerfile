# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @king-chess/server build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000
ENV STOCKFISH_PATH=/usr/games/stockfish

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 appuser

COPY --from=builder /app /app
USER appuser

EXPOSE 10000
CMD ["node", "apps/server/dist/apps/server/src/index.js"]
