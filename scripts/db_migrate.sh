#!/usr/bin/env bash
# ============================================================
#  AlphaSync Demo — One-shot data migration (server-side)
#
#  Loads alphasync_demo.sql into the LIVE demo Postgres container
#  (brokerdemo-pg) that runs on the Contabo VPS. Designed to be invoked
#  by the GitHub Actions deploy workflow over SSH — NOT run by hand
#  on this Windows machine (there is no Docker here).
#
#  What it does, in order:
#    1. Sanity-checks the dump file and the running pg container.
#    2. Takes a FULL pre-migration backup of the current DB
#       (kept under backups/, so nothing is ever lost).
#    3. DROPs + recreates the public schema (clears current data).
#    4. Loads alphasync_demo.sql into the now-empty database.
#    5. Verifies row counts per table and prints them.
#
#  Safety:
#    - Uses the REAL container name (brokerdemo-pg) and project (brokerdemo)
#      as defined in docker-compose.demo.yml — older scripts used stale
#      names (alphasync-demo-pg / asdemo-pg) and would never find the
#      container.
#    - Reads DB credentials from the container's own environment, so
#      no secrets are duplicated here.
#    - ON_ERROR_STOP=1 on load: any error aborts and the pre-migration
#      backup is left in place for rollback.
#    - Requires an explicit "yes" confirmation UNLESS run with
#      FORCE_YES=1 (the CI path sets this after the operator has
#      deliberately triggered the migration).
#
#  Usage:
#    On server (interactive):   bash scripts/db_migrate.sh
#    From CI (non-interactive): FORCE_YES=1 bash scripts/db_migrate.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Real names from docker-compose.yml (project "acalphasync").
PG_CONTAINER="${PG_CONTAINER:-acalphasync-pg}"
DUMP_FILE="${DUMP_FILE:-${PROJECT_ROOT}/alphasync_dump.sql}"
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOG_DIR="${PROJECT_ROOT}/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/db_migrate_${TIMESTAMP}.log"
PRE_MIGRATE_BACKUP="${BACKUP_DIR}/pre_migrate_${TIMESTAMP}.sql"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}>>>${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[!]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; exit 1; }

mkdir -p "${BACKUP_DIR}" "${LOG_DIR}"
touch "${LOG_FILE}"

info "AlphaSync DB migration started at $(date -Iseconds)"
info "Log: ${LOG_FILE}"

# ── Pre-flight checks ───────────────────────────────────────
command -v docker >/dev/null || fail "docker not found (this must run on the server, not locally)."
[[ -s "${DUMP_FILE}" ]] || fail "${DUMP_FILE} not found or empty — nothing to migrate."

if ! docker ps --format '{{.Names}}' | grep -qx "${PG_CONTAINER}"; then
    fail "Container ${PG_CONTAINER} is not running. Start the stack first: docker compose -p acalphasync -f docker-compose.yml up -d acalphasync-pg"
fi

PG_USER="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_USER)"
PG_DB="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_DB)"
PG_PASSWORD="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_PASSWORD)"
[[ -n "${PG_USER}" && -n "${PG_DB}" ]] || fail "Could not read POSTGRES_USER/DB from ${PG_CONTAINER}."

info "Target: container=${PG_CONTAINER} db=${PG_DB} user=${PG_USER}"

# ── Confirmation gate ───────────────────────────────────────
warn "This will REPLACE all current data in database '${PG_DB}' (container ${PG_CONTAINER})"
warn "with the contents of $(basename "${DUMP_FILE}"). A full backup is taken first"
warn "and kept at: ${PRE_MIGRATE_BACKUP}.gz"
if [[ "${FORCE_YES:-0}" == "1" ]]; then
    info "FORCE_YES=1 set — proceeding without interactive confirmation."
else
    read -r -p "Type 'yes' to continue: " CONFIRM
    [[ "${CONFIRM}" == "yes" ]] || fail "Aborted by user."
fi

# ── Step 1: backup current DB ───────────────────────────────
info "Step 1/4: Backing up current database to ${PRE_MIGRATE_BACKUP}"
docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    pg_dump -U "${PG_USER}" -d "${PG_DB}" --clean --if-exists > "${PRE_MIGRATE_BACKUP}" \
    2>> "${LOG_FILE}" || fail "Pre-migration backup failed — aborting, DB left untouched."

[[ -s "${PRE_MIGRATE_BACKUP}" ]] || fail "Pre-migration backup came back empty — aborting, DB left untouched."
gzip -f "${PRE_MIGRATE_BACKUP}"
ok "Pre-migration backup saved: ${PRE_MIGRATE_BACKUP}.gz"

# ── Step 2: drop and recreate schema ────────────────────────
info "Step 2/4: Dropping and recreating public schema on '${PG_DB}'"
docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U "${PG_USER}" -d "${PG_DB}" -c \
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${PG_USER}; GRANT ALL ON SCHEMA public TO public;" \
    2>&1 | tee -a "${LOG_FILE}" || fail "Failed to reset schema — restore from ${PRE_MIGRATE_BACKUP}.gz if needed."
ok "Old schema cleared."

# ── Step 3: load the migrated dump ──────────────────────────
info "Step 3/4: Loading $(basename "${DUMP_FILE}") into '${PG_DB}'"
if ! docker exec -i -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U "${PG_USER}" -d "${PG_DB}" < "${DUMP_FILE}" \
    >> "${LOG_FILE}" 2>&1; then
    fail "Migration failed while loading dump. DB may be partially loaded. Pre-migration backup is at ${PRE_MIGRATE_BACKUP}.gz — see ${LOG_FILE}."
fi
ok "Dump loaded successfully."

# ── Step 4: sanity check ────────────────────────────────────
info "Step 4/4: Verifying — row counts per table"
docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    psql -U "${PG_USER}" -d "${PG_DB}" -c "
    SELECT n.nspname AS schema, c.relname AS table_name,
           (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid) AS row_estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY c.relname;" | tee -a "${LOG_FILE}"

ok "Migration complete at $(date -Iseconds)"
ok "Pre-migration backup kept at: ${PRE_MIGRATE_BACKUP}.gz"
ok "Full log: ${LOG_FILE}"
