#!/usr/bin/env bash
#
# Push the local .env.local into a Vercel project.
#
# Reads every value from .env.local at run time — no secret is written into this file,
# so it is safe to commit. Run it after `vercel login` and `vercel link`.
#
#   bash scripts/vercel-env-push.sh preview
#   bash scripts/vercel-env-push.sh production
#
# The four credentials are added with --sensitive, which makes them write-only: Vercel
# will never show them again in the dashboard or the CLI. The other three are left
# readable on purpose — a project URL, a location id and two integers are not secrets,
# and being able to see them is worth more than hiding them when something misbehaves.
set -euo pipefail

TARGET="${1:-preview}"
ENV_FILE=".env.local"

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE here. Run from the repo root."; exit 1; }
[ -d ".vercel" ] || { echo "Project not linked. Run 'vercel link' first."; exit 1; }

SENSITIVE="SUPABASE_SERVICE_ROLE_KEY PRICING_API_KEY GHL_PIT_TOKEN CRON_SECRET"
READABLE="SUPABASE_URL GHL_LOCATION_ID ABANDONMENT_IDLE_MINUTES ABANDONMENT_MAX_AGE_DAYS"

value_of() {
  # Last assignment wins, quotes stripped, comments and blanks ignored
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

push() {
  local name="$1" flag="$2" val
  val="$(value_of "$name")"

  if [ -z "$val" ]; then
    echo "  skip  $name (empty in $ENV_FILE)"
    return
  fi
  case "$val" in
    '<'*|*'>') echo "  SKIP  $name — still a placeholder, fix it before deploying"; return ;;
  esac

  # --force overwrites an existing value rather than failing
  printf '%s' "$val" | vercel env add "$name" "$TARGET" $flag --force >/dev/null 2>&1 \
    && echo "  ok    $name${flag:+  (sensitive)}" \
    || echo "  FAIL  $name"
}

echo "Pushing $ENV_FILE -> Vercel [$TARGET]"
for n in $SENSITIVE; do push "$n" "--sensitive"; done
for n in $READABLE;  do push "$n" ""; done

echo
echo "PRICING_API_URL is deliberately not pushed: it is an override, and unset means"
echo "the code uses its documented default."
echo
echo "Done. 'vercel env ls $TARGET' to confirm — sensitive values will show as hidden."
