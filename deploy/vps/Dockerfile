# T-Skills on VPS: build once, run anywhere with Node 22 + SQLite.
# Cloudflare Worker artifacts (wrangler.jsonc, worker/, D1/R2 bindings) are
# untouched; this target reuses the same source with Node adapters.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:vps

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --create-home --uid 10001 app
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate-sqlite.mjs ./scripts/migrate-sqlite.mjs
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /data && chown app:app /data /app
USER app
EXPOSE 3000
# Apply pending SQLite migrations on every boot (idempotent), then serve.
CMD ["sh", "-c", "node scripts/migrate-sqlite.mjs && exec node .output/server/index.mjs"]
