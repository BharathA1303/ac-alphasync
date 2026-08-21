#!/usr/bin/env bash
# ============================================================================
#  AlphaSync Real — Update to latest code (in-place, zero cross-app impact)
#  Run ON the server from /opt/apps/alphasync-real
#
#  Flow (exactly what the standard allows):
#    git pull → docker compose pull → up -d --build → docker image prune -f
#  Records current image IDs first so rollback.sh can revert instantly.
# ============================================================================
set -euo pipefail

APP="alphasync-real"
APP_DIR="/opt/apps/${APP}"
COMPOSE="docker compose -p ${APP} -f ${APP_DIR}/docker-compose.yml"
STATE_DIR="${APP_DIR}/deploy"

info() { printf '\033[0;36m>>> %s\033[0m\n' "$*"; }
fail() { printf '\033[0;31m[FAIL] %s\033[0m\n' "$*"; exit 1; }

cd "${APP_DIR}" || fail "Expected app at ${APP_DIR}."
mkdir -p "${STATE_DIR}"

info "Recording current image IDs for rollback"
{
  echo "backend=$(docker inspect --format='{{.Image}}' ${APP}-backend 2>/dev/null || true)"
  echo "frontend=$(docker inspect --format='{{.Image}}' ${APP}-frontend 2>/dev/null || true)"
} > "${STATE_DIR}/last_good_images.env"

info "git pull"
git pull --ff-only

info "docker compose pull (base images only; app images are built)"
${COMPOSE} pull --ignore-buildable || true

info "Building + recreating (scoped to project ${APP} only)"
${COMPOSE} up -d --build

info "Waiting for backend health"
for i in $(seq 1 40); do
  status="$(docker inspect --format='{{.State.Health.Status}}' ${APP}-backend 2>/dev/null || echo unknown)"
  [[ "${status}" == "healthy" ]] && break
  echo "  waiting... ($((i*5))s, status=${status})"; sleep 5
done
[[ "${status:-}" == "healthy" ]] || { docker logs ${APP}-backend --tail 80; fail "Backend not healthy after update — run rollback.sh"; }

# Scoped cleanup only: dangling images. Never system/volume/network prune.
info "Pruning dangling images"
docker image prune -f

info "Update complete."
${COMPOSE} ps
