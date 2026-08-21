#!/usr/bin/env bash
# ============================================================================
#  AlphaSync Real — First-time / full deployment
#  Run ON the server from /opt/apps/alphasync-real
#
#  Strictly scoped to compose project "alphasync-real". Never references,
#  stops, or removes containers/networks/volumes of any other application.
# ============================================================================
set -euo pipefail

APP="alphasync-real"
APP_DIR="/opt/apps/${APP}"
COMPOSE="docker compose -p ${APP} -f ${APP_DIR}/docker-compose.yml"
DOMAIN="demo.alphasync.app"
NGINX_SITE="/etc/nginx/sites-enabled/${DOMAIN}.conf"

green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
info()  { printf '\033[0;36m>>> %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
fail()  { printf '\033[0;31m[FAIL] %s\033[0m\n' "$*"; exit 1; }

cd "${APP_DIR}" || fail "Expected app at ${APP_DIR} (server standard: /opt/apps/${APP})."

command -v docker >/dev/null || fail "docker not found."
[[ -f docker-compose.yml ]]  || fail "docker-compose.yml missing in ${APP_DIR}."
[[ -f .env ]]                || fail ".env missing — copy .env.example to .env and fill it in."

mkdir -p uploads logs nginx scripts deploy

info "Building and starting the ${APP} stack (project=${APP})"
${COMPOSE} up -d --build

info "Waiting for backend health"
for i in $(seq 1 40); do
  status="$(docker inspect --format='{{.State.Health.Status}}' ${APP}-backend 2>/dev/null || echo unknown)"
  [[ "${status}" == "healthy" ]] && { green "Backend healthy."; break; }
  state="$(docker inspect --format='{{.State.Status}}' ${APP}-backend 2>/dev/null || echo unknown)"
  [[ "${state}" == "exited" || "${state}" == "dead" ]] && { docker logs ${APP}-backend --tail 80; fail "Backend crashed."; }
  echo "  waiting... ($((i*5))s, status=${status})"; sleep 5
done

# ── Host nginx: install ONLY this app's site ──
if [[ -f "${APP_DIR}/nginx/${DOMAIN}.conf" ]]; then
  info "Installing host nginx site for ${DOMAIN} (no other site touched)"
  cp "${APP_DIR}/nginx/${DOMAIN}.conf" "${NGINX_SITE}"
  mkdir -p /etc/nginx/ssl-certificates
  if [[ ! -f "/etc/nginx/ssl-certificates/${DOMAIN}.crt" ]]; then
    info "No cert found — creating a temporary self-signed cert (replace with certbot)."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "/etc/nginx/ssl-certificates/${DOMAIN}.key" \
      -out "/etc/nginx/ssl-certificates/${DOMAIN}.crt" \
      -subj "/CN=${DOMAIN}" 2>/dev/null || true
  fi
  if nginx -t; then systemctl reload nginx && green "nginx reloaded."; else echo "WARNING: nginx config test failed — not reloading."; fi
fi

# ── Seed the root admin (idempotent; safe if account not created yet) ──
if [[ -f "${APP_DIR}/scripts/seed_root_admin.sh" ]]; then
  info "Seeding root admin"
  bash "${APP_DIR}/scripts/seed_root_admin.sh" || warn "Root admin seed skipped/failed (non-fatal)."
fi

green "Deployment complete → https://${DOMAIN}"
${COMPOSE} ps
