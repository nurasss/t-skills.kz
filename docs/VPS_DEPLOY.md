# T-Skills on VPS (Ubuntu + Docker + Caddy)

This target runs the same source as Cloudflare Workers, with Node adapters:
SQLite file instead of D1, local directory instead of R2, system cron instead
of Worker triggers. No application query or storage call site differs between
targets; the swap happens in `db/index.ts` + the `@/lib/node-store` vite
alias (see `lib/node-store-node.ts`).

## 1. Server requirements

- Ubuntu 22.04/24.04 VPS, 1 vCPU / 2 GB RAM minimum for the pilot.
- Docker Engine + Compose plugin.
- DNS: `A t-skills.kz -> <vps-ip>` (remove Cloudflare proxy beforehand if the
  domain was proxied; Caddy must reach the server on ports 80/443 for TLS).
- Open TCP 80/443 (and 22 for SSH) in the firewall.

## 2. First deploy

```bash
git clone <repo> && cd gallup
cp deploy/vps/.env.example deploy/vps/.env
# Fill deploy/vps/.env: secrets (openssl rand -hex 32), APP_BASE_URL,
# EMAIL_FROM with a Resend-verified sender, SUPPORT_CONTACT + all LEGAL_*.
# Keep LEGAL_DOCUMENTS_APPROVED=false until the signed approval record is complete;
# only then set it true and explicitly enable PUBLIC_INDEXING_ENABLED if public launch is approved.
docker compose -f deploy/vps/docker-compose.yml up -d --build
# Migrations run automatically on every boot (idempotent).
docker compose -f deploy/vps/docker-compose.yml logs -f app
```

Open `https://t-skills.kz` and check: landing shows T-Skills, `/api/catalog`
returns the current test, and `/tests/orbita30` redirects (308) to
`/tests/t-skills`. Until legal approval, the catalog returns only unapproved
draft markers, legal approval metadata does not block new registration, assessment creation or checkout.
`GET /robots.txt` follows the `PUBLIC_INDEXING_ENABLED` setting. After the signed approval record,
verified legal values and public-indexing decision, confirm the expected
robots rules and sitemap URL.

> Shared-proxy caveat: if the front proxy bind-mounts its config file
> (e.g. `-v /opt/site/Caddyfile:/etc/caddy/Caddyfile:ro`), never edit it
> with tools that replace the file (`sed -i`, `fmt --overwrite`): the
> container keeps seeing the old inode. Either rewrite in place
> (`cat new-content | sudo tee <file>`) or restart the proxy container
> after editing.

## 3. Retention cron (host side)

The in-app sweep is exposed at `POST /internal/retention` (token-gated).
Add to the host crontab (`crontab -e`):

```cron
0 2 * * * /usr/bin/curl -sf -X POST https://t-skills.kz/internal/retention -H "X-Internal-Token: ${ORBITA_INTERNAL_TOKEN}" -H 'Content-Type: application/json' -d '{"dry_run":false,"limit":500}' >> /var/log/t-skills-retention.log 2>&1
```

Preview first with `{"dry_run":true,"limit":100}`.

## 4. Operations

- **Data lives in the `tskills-data` volume**: SQLite (`/data/app.db*`) and
  files (`/data/files`). Back it up, e.g. nightly:
  `docker run --rm -v tskills-data:/data -v /backup:/backup ubuntu tar czf /backup/t-skills-$(date +%F).tgz -C /data .`
  Stop-the-world is not required for SQLite backup with WAL, but restore must
  happen with the app stopped.
- **Updates**: deploy one reviewed source snapshot. Before copying it, check
  `df -h /opt`; keep at least 2 GB free for the full Docker build and image
  layers. This VPS is shared with other applications: never run global
  `docker system prune` or delete images/volumes belonging to other services.
  Exclude `deploy/vps/.env`, all other environment files, `.git`,
  `node_modules`, generated build output and application data from the source
  transfer; do not use `rsync --delete` on the shared host. Save the currently
  running `t-skills:vps` image under a rollback tag before building.
- Build the candidate image first with the Linux VPS target, then stop only the
  `app` service, back up the `tskills-data` volume, and recreate only `app`.
  Migrations apply on boot. Check `docker compose ... logs app`,
  `https://t-skills.kz/api/health`, `/api/catalog`, `/robots.txt` and an
  unauthenticated admin route before considering the rollout complete.
  Rollback: retag the saved image as `t-skills:vps`, then recreate only `app`
  with `--no-build --force-recreate` only if the previous image understands the
  current schema and version snapshots. If a migration changes stored version
  metadata, image-only rollback is unsafe: restore the matching DB/files
  snapshot with the app stopped, or forward-fix.
- **Logs**: `docker compose ... logs -f app` (JSON request lines), Caddy access
  logs via the caddy service.
- **Stripe webhooks**: set the endpoint to
  `https://t-skills.kz/api/payments/webhook` after live approval; keep
  `PAYMENTS_ENABLED=false` until then.

## 5. Security notes (read before launch)

- Keep `REGISTRATION_MODE=invite` + `PUBLIC_SIGNUP_ENABLED=false` until an
  explicit decision to open signup (closed beta posture).
- Never commit `deploy/vps/.env`. Rotate any secret that touched chat/email.
- Keep `deploy/vps/.env` mode `0600`; do not display it in a terminal capture
  or include it in an artifact.
- Exactly one reverse proxy (Caddy) sits in front of the app; `TRUST_PROXY`
  exists for that setup only. Adding Cloudflare proxy/CDN in front later
  restores `CF-Connecting-IP` automatically (preferred over XFF).
- Rate limiting, CSRF, CSP, HSTS and Security headers behave exactly as on
  Workers (`nitro/plugins/vps-security.ts` mirrors `worker/index.ts`).
- Backups contain personal data: encrypt and restrict access accordingly.

## 6. Local VPS-mode check (no Docker)

```bash
npm run build:vps
SQLITE_DB_PATH=./data/local.db VPS_FILE_DIR=./data/local-files \
ORBITA_ENV=development node scripts/migrate-sqlite.mjs
SQLITE_DB_PATH=./data/local.db VPS_FILE_DIR=./data/local-files \
ORBITA_ENV=development PORT=3101 npm run start:vps
```
