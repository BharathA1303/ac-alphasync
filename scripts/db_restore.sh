#!/usr/bin/env bash
# ============================================================
#  AlphaSync Demo — Restore DB from alphasync_demo.sql
#
#  What this does, in order:
#    1. Takes a full backup of whatever is currently in demo-pg
#       (so the "corrupted" old data is never lost, just archived).
#    2. Drops and recreates the public schema (clears old/corrupted data).
#    3. Loads alphasync_demo.sql into the now-empty database.
#    4. Runs a sanity check (row counts per table) and prints it.
#
#  Nothing here is silent — every step is logged to stdout and
#  to a timestamped log file under logs/.
#
#  Usage (from project root, where alphasync_demo.sql lives):
#    bash scripts/db_restore.sh
#
#  Safety:
#    - Requires typing "yes" to confirm before touching the DB.
#    - Refuses to run if the dump file is missing or empty.
#    - Pre-restore backup is kept regardless of outcome.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

COMPOSE_FILE="docker-compose.yml"
PG_CONTAINER="acalphasync-pg"
DUMP_FILE="${PROJECT_ROOT}/acalphasync_dump.sql"
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOG_DIR="${PROJECT_ROOT}/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/db_restore_${TIMESTAMP}.log"
PRE_RESTORE_BACKUP="${BACKUP_DIR}/pre_restore_${TIMESTAMP}.sql"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}>>>${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[!]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; exit 1; }

mkdir -p "${BACKUP_DIR}" "${LOG_DIR}"
touch "${LOG_FILE}"

info "AlphaSync DB restore started at $(date -Iseconds)"
info "Log: ${LOG_FILE}"

# ── Pre-flight checks ───────────────────────────────────────
command -v docker >/dev/null || fail "docker not found."
[[ -s "${DUMP_FILE}" ]] || fail "${DUMP_FILE} not found or empty — nothing to restore."

if ! docker ps --format '{{.Names}}' | grep -qx "${PG_CONTAINER}"; then
    fail "Container ${PG_CONTAINER} is not running. Start the stack first (docker compose -p acalphasync -f ${COMPOSE_FILE} up -d acalphasync-pg)."
fi

PG_USER="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_USER)"
PG_DB="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_DB)"
PG_PASSWORD="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_PASSWORD)"

warn "This will DELETE all current data in database '${PG_DB}' (container ${PG_CONTAINER})"
warn "and replace it with the contents of $(basename "${DUMP_FILE}")."
warn "A full backup will be taken first and kept at: ${PRE_RESTORE_BACKUP}.gz"
read -r -p "Type 'yes' to continue: " CONFIRM
[[ "${CONFIRM}" == "yes" ]] || fail "Aborted by user."

# ── Step 1: backup current (possibly corrupted) DB ──────────
info "Step 1/4: Backing up current database to ${PRE_RESTORE_BACKUP}"
docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    pg_dump -U "${PG_USER}" -d "${PG_DB}" --clean --if-exists > "${PRE_RESTORE_BACKUP}" \
    2>> "${LOG_FILE}" || fail "Pre-restore backup failed — aborting, DB left untouched."

if [[ ! -s "${PRE_RESTORE_BACKUP}" ]]; then
    fail "Pre-restore backup came back empty — aborting, DB left untouched."
fi
gzip -f "${PRE_RESTORE_BACKUP}"
ok "Pre-restore backup saved: ${PRE_RESTORE_BACKUP}.gz"

# ── Step 2: drop and recreate schema (clear corrupted data) ─
info "Step 2/4: Dropping and recreating public schema on '${PG_DB}'"
docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U "${PG_USER}" -d "${PG_DB}" -c \
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${PG_USER}; GRANT ALL ON SCHEMA public TO public;" \
    2>&1 | tee -a "${LOG_FILE}" || fail "Failed to reset schema — restore from ${PRE_RESTORE_BACKUP}.gz if needed."
ok "Old schema cleared."

# ── Step 3: load new dump ────────────────────────────────────
info "Step 3/4: Loading $(basename "${DUMP_FILE}") into '${PG_DB}'"
if ! docker exec -i -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U "${PG_USER}" -d "${PG_DB}" < "${DUMP_FILE}" \
    >> "${LOG_FILE}" 2>&1; then
    fail "Restore failed while loading dump. DB may be partially loaded. Full pre-restore backup is at ${PRE_RESTORE_BACKUP}.gz — see ${LOG_FILE} for details."
fi
ok "Dump loaded successfully."

# ── Step 4: sanity check ─────────────────────────────────────
info "Step 4/4: Verifying — row counts per table"
docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
    psql -U "${PG_USER}" -d "${PG_DB}" -c "
    SELECT schemaname, relname AS table_name, n_live_tup AS row_estimate
    FROM pg_stat_user_tables
    ORDER BY relname;" | tee -a "${LOG_FILE}"

ok "Restore complete at $(date -Iseconds)"
ok "Pre-restore backup kept at: ${PRE_RESTORE_BACKUP}.gz"
ok "Full log: ${LOG_FILE}"
