#!/usr/bin/env bash
# ============================================================================
#  AlphaSync Real — Seed the root admin
#  Promotes ROOT_ADMIN_EMAIL to role='admin' + admin_level='root' in the DB.
#
#  Why this is needed IN ADDITION to ROOT_ADMIN_EMAIL config:
#    - ROOT_ADMIN_EMAIL grants root *level* via email match, BUT the admin
#      route guard (get_admin_user) still requires role='admin' on the row.
#    - So the account needs role='admin' set once; this does it idempotently.
#
#  Safe: touches ONLY the single root-admin email. No-op if that account has
#  not logged in yet (accounts are created on first Firebase login).
#  Run ON the server from /opt/apps/alphasync-real.
# ============================================================================
set -euo pipefail

APP="alphasync-real"
APP_DIR="/opt/apps/${APP}"
PG_CONTAINER="alphasync-real-postgres"

info() { printf '\033[0;36m>>> %s\033[0m\n' "$*"; }
ok()   { printf '\033[0;32m[OK] %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
fail() { printf '\033[0;31m[FAIL] %s\033[0m\n' "$*"; exit 1; }

# Read the target email from .env (falls back to the code default).
ROOT_EMAIL="$(grep -E '^ROOT_ADMIN_EMAIL=' "${APP_DIR}/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | xargs || true)"
ROOT_EMAIL="${ROOT_EMAIL:-meganath1025@gmail.com}"
[[ -n "${ROOT_EMAIL}" ]] || fail "ROOT_ADMIN_EMAIL is empty."

docker ps --format '{{.Names}}' | grep -qx "${PG_CONTAINER}" || fail "${PG_CONTAINER} not running."
PG_USER="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_USER)"
PG_DB="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_DB)"
PG_PASSWORD="$(docker exec "${PG_CONTAINER}" printenv POSTGRES_PASSWORD)"

info "Seeding root admin: ${ROOT_EMAIL} (db=${PG_DB})"

# Case-insensitive match; grants root admin AND fully activates the account.
# account_status is the authoritative login gate (auth.py) — a root admin that
# is 'pending_approval' cannot log in, so we force it 'active' + is_active here.
# UPDATE affects 0 rows if the account has not been created yet — that is fine,
# the email is still root by config once they log in and this can be re-run.
ROWS="$(docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
  psql -tA -v ON_ERROR_STOP=1 -U "${PG_USER}" -d "${PG_DB}" -c \
  "UPDATE users
      SET role='admin',
          admin_level='root',
          account_status='active',
          is_active=true,
          approved_at=COALESCE(approved_at, now()),
          admin_assigned_at=COALESCE(admin_assigned_at, now())
    WHERE lower(email)=lower('${ROOT_EMAIL}')
    RETURNING id;" | grep -c . || true)"

if [[ "${ROWS}" -ge 1 ]]; then
  ok "Promoted ${ROOT_EMAIL} to root admin (role=admin, admin_level=root)."
else
  warn "No account for ${ROOT_EMAIL} yet — it is root by config and will gain role='admin' when this seed re-runs after first login."
fi
