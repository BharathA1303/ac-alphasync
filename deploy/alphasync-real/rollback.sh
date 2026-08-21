#!/usr/bin/env bash
# ============================================================================
#  AlphaSync Real — Rollback
#  Run ON the server from /opt/apps/alphasync-real
#
#  Modes:
#    (default)  Revert to the previous git commit and rebuild.
#    --images   Restart last-known-good image IDs (no rebuild) from
#               deploy/last_good_images.env (written by update.sh).
#
#  Scoped strictly to project "alphasync-real". Data volumes are never
#  touched, so Postgres/Redis/uploads data survives a rollback.
# ============================================================================
set -euo pipefail

APP="alphasync-real"
APP_DIR="/opt/apps/${APP}"
COMPOSE="docker compose -p ${APP} -f ${APP_DIR}/docker-compose.yml"
STATE_DIR="${APP_DIR}/deploy"
MODE="${1:-git}"

info() { printf '\033[0;36m>>> %s\033[0m\n' "$*"; }
fail() { printf '\033[0;31m[FAIL] %s\033[0m\n' "$*"; exit 1; }

cd "${APP_DIR}" || fail "Expected app at ${APP_DIR}."

if [[ "${MODE}" == "--images" ]]; then
  [[ -f "${STATE_DIR}/last_good_images.env" ]] || fail "No last_good_images.env — use git rollback."
  # shellcheck disable=SC1091
  source "${STATE_DIR}/last_good_images.env"
  [[ -n "${backend:-}" && -n "${frontend:-}" ]] || fail "Recorded image IDs are empty."
  info "Re-tagging last-good images and recreating containers"
  docker tag "${backend}"  ${APP}-backend:latest
  docker tag "${frontend}" ${APP}-frontend:latest
  ${COMPOSE} up -d --no-build
else
  info "Reverting working tree to previous commit"
  PREV="$(git rev-parse HEAD~1)" || fail "Cannot resolve previous commit."
  git reset --hard "${PREV}"
  info "Rebuilding from ${PREV}"
  ${COMPOSE} up -d --build
fi

info "Waiting for backend health"
for i in $(seq 1 40); do
  status="$(docker inspect --format='{{.State.Health.Status}}' ${APP}-backend 2>/dev/null || echo unknown)"
  [[ "${status}" == "healthy" ]] && break
  echo "  waiting... ($((i*5))s, status=${status})"; sleep 5
done
[[ "${status:-}" == "healthy" ]] || { docker logs ${APP}-backend --tail 80; fail "Backend still unhealthy after rollback."; }

info "Rollback complete."
${COMPOSE} ps
