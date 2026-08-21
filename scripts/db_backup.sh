#!/usr/bin/env bash
# ============================================================
#  AlphaSync Demo — Daily PostgreSQL backup
#
#  Dumps the demo-pg container's database to a timestamped
#  .sql file and prunes backups older than RETENTION_DAYS.
#
#  Usage (from project root on the VPS, e.g. /opt/alphasync-demo):
#    bash scripts/db_backup.sh
#
#  Cron (daily at 02:00 server time):
#    0 2 * * * cd /opt/alphasync-demo && bash scripts/db_backup.sh >> /var/log/alphasync-db-backup.log 2>&1
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

COMPOSE_PROJECT="acalphasync"
COMPOSE_FILE="docker-compose.yml"
PG_CONTAINER="acalphasync-pg"
BACKUP_DIR="${PROJECT_ROOT}/backups"
RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/acalphasync_${TIMESTAMP}.sql"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}>>>${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

[[ -f "${COMPOSE_FILE}" ]] || fail "${COMPOSE_FILE} not found — run this from the project root."
command -v docker >/dev/null || fail "docker not found."

mkdir -p "${BACKUP_DIR}"

if ! docker ps --format '{{.Names}}' | grep -qx "${PG_CONTAINER}"; then
    fail "Container ${PG_CONTAINER} is not running. Is the stack up? (docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} ps)"
fi

# Read DB credentials from the running container's own environment
# so this script never needs secrets duplicated into it.
PG_USER="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_USER)"
PG_DB="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_DB)"

info "Backing up '${PG_DB}' from ${PG_CONTAINER} -> ${BACKUP_FILE}"
docker exec -e PGPASSWORD="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_PASSWORD)" \
    "${PG_CONTAINER}" pg_dump -U "${PG_USER}" -d "${PG_DB}" --clean --if-exists > "${BACKUP_FILE}"

if [[ ! -s "${BACKUP_FILE}" ]]; then
    fail "Backup file is empty — pg_dump likely failed. Check output above."
fi

gzip -f "${BACKUP_FILE}"
BACKUP_FILE="${BACKUP_FILE}.gz"
BACKUP_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
ok "Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

info "Pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}"
find "${BACKUP_DIR}" -name 'alphasync_demo_*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

ok "Backup job finished at $(date -Iseconds)"
