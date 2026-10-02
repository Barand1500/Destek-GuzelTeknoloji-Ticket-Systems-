#!/usr/bin/env bash
# Run on the server after pushing to Git:
#   bash /path/to/destek-helpdesk/scripts/server-deploy.sh
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"
PM2_NAME="${DEPLOY_PM2_NAME:-destek-helpdesk}"
STARTED_AT="$(date +%s)"

fail() { printf '\nDeploy failed: %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }
trap 'printf "\nDeploy failed at line %s. API process was not restarted if the failure occurred before the PM2 step.\n" "$LINENO" >&2' ERR

for command in git node npm pm2 curl flock; do
  command -v "$command" >/dev/null 2>&1 || fail "Required command missing: $command"
done
[[ -d "$REPO_DIR/.git" ]] || fail "Git repository not found: $REPO_DIR"
[[ -f "$REPO_DIR/backend/.env" ]] || fail "Create backend/.env on the server before deploying."

# Prevent two SSH sessions from deploying this checkout at the same time.
if [[ "${DEPLOY_REEXEC:-0}" != 1 ]]; then
  LOCK_FILE="${TMPDIR:-/tmp}/destek-helpdesk-$(printf '%s' "$REPO_DIR" | sha256sum | cut -c1-16).lock"
  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "Another deployment is already running for $REPO_DIR"
fi

cd "$REPO_DIR"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail "The server checkout has local changes. Commit or move them before deploying."
[[ "$(git branch --show-current)" == "$BRANCH" ]] || fail "Checkout must be on branch $BRANCH."
git remote get-url origin >/dev/null || fail "Git remote 'origin' is missing."

step "Fetch origin/$BRANCH"
BEFORE="$(git rev-parse --short HEAD)"
git fetch --prune origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
git merge --ff-only "origin/$BRANCH"
AFTER="$(git rev-parse --short HEAD)"
printf 'Commit: %s -> %s\n' "$BEFORE" "$AFTER"

# If the fetched commit updates this script, continue using its new version.
if [[ "$BEFORE" != "$AFTER" && "${DEPLOY_REEXEC:-0}" != 1 ]]; then
  export DEPLOY_REEXEC=1
  exec bash "$REPO_DIR/scripts/server-deploy.sh"
fi

step "Install locked workspace dependencies"
npm ci --no-audit --no-fund

step "Generate Prisma client and build API + frontend"
npm run db:generate
npm run build
[[ -f "$REPO_DIR/backend/dist/src/server.js" ]] || fail "Backend build output is missing."
[[ -f "$REPO_DIR/frontend/dist/index.html" ]] || fail "Frontend build output is missing."

step "Apply pending MySQL migrations"
npm run db:migrate

# dotenv is loaded from backend/.env, just as the API loads it when PM2 uses
# backend as its working directory. DEPLOY_HEALTH_URL can override this URL.
API_PORT="$(cd "$REPO_DIR/backend" && node --input-type=module -e "import 'dotenv/config'; process.stdout.write(String(process.env.PORT || 3000))")"
[[ "$API_PORT" =~ ^[0-9]+$ ]] || fail "Invalid PORT in backend/.env: $API_PORT"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:${API_PORT}/api/health}"

step "Restart API with PM2"
export NODE_ENV=production
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start "$REPO_DIR/backend/dist/src/server.js" \
    --name "$PM2_NAME" --cwd "$REPO_DIR/backend"
fi
pm2 save

step "Check API health"
HEALTHY=0
for attempt in {1..15}; do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 2
done
[[ "$HEALTHY" == 1 ]] || fail "Health check failed: $HEALTH_URL. Inspect: pm2 logs $PM2_NAME"

printf '\nDeploy complete: %s (%ss)\n' "$AFTER" "$(( $(date +%s) - STARTED_AT ))"
printf 'Frontend: %s/frontend/dist\nAPI: %s\n' "$REPO_DIR" "$HEALTH_URL"
