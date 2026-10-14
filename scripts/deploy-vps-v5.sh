#!/usr/bin/env bash
# One-off rollout of teen v5 (commit 3c40c82) to kz-vps, following
# RUNBOOKS.md "Manual VPS deployment over SSH". Run from the repo root on the Mac.
# Stops on the first error; the running site is touched only after the image builds.
set -euo pipefail

SHA=3c40c82
TS=$(date +%Y%m%d-%H%M)
HOST=kz-vps
BUNDLE="t-skills-src-$SHA.tar"

echo "== 1/6 Source bundle from git $SHA (tracked files only, no .env)"
git archive --format=tar -o "/tmp/$BUNDLE" "$SHA"
scp -q "/tmp/$BUNDLE" "$HOST:~/t-skills-backups/$BUNDLE"

ssh "$HOST" TS="$TS" BUNDLE="$BUNDLE" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/t-skills/deploy/vps
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.shared-proxy.yml"
test "$(stat -c %a .env)" = 600

echo "== 2/6 Backups: source tree + rollback image tag"
tar czf ~/t-skills-backups/src-pre-v5-$TS.tgz -C /opt \
  --exclude=t-skills/node_modules --exclude='t-skills/.env*' --exclude=t-skills/deploy/vps/.env \
  --exclude=t-skills/.output --exclude=t-skills/data t-skills
docker tag t-skills:vps t-skills:vps-pre-v5-$TS

echo "== 3/6 Update source (no deletes; deploy/vps/.env untouched)"
tar xf ~/t-skills-backups/$BUNDLE -C /opt/t-skills
test "$(stat -c %a .env)" = 600

echo "== 4/6 Build candidate image (site keeps running)"
$COMPOSE build app

echo "== 5/6 Stop app, back up data volume, start new image"
$COMPOSE stop app
docker run --rm --user 0 --entrypoint tar -v vps_tskills-data:/data:ro -v "$HOME/t-skills-backups:/backup" \
  t-skills:vps-pre-v5-$TS czf /backup/data-pre-v5-$TS.tgz -C /data .
$COMPOSE up -d --no-build app

echo "== 6/6 Verify"
for i in $(seq 1 30); do curl -fsS https://t-skills.kz/api/health >/dev/null 2>&1 && break; sleep 2; done
curl -fsS https://t-skills.kz/api/health; echo
curl -fsS https://t-skills.kz/api/catalog | grep -o 't-skills-teen-v[0-9]*' | sort -u
curl -s -o /dev/null -w 'robots %{http_code}\n' https://t-skills.kz/robots.txt
curl -s -o /dev/null -w 'admin (unauth) %{http_code}\n' https://t-skills.kz/api/admin/analytics
$COMPOSE logs --tail 40 app | grep -iE 'migrat|error' || true
ls -la ~/t-skills-backups/*-pre-v5-$TS.tgz
echo "Rollback image: t-skills:vps-pre-v5-$TS"
REMOTE
