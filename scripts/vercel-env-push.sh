#!/usr/bin/env bash
#
# Push the local environment into a Vercel project.
#
# Reads every value at run time — no secret is written into this file, so it is safe to
# commit. Run it after `vercel login` and `vercel link`.
#
#   bash scripts/vercel-env-push.sh preview
#   bash scripts/vercel-env-push.sh production
#
# Reads `.env` and `.env.local`, last assignment winning, which matches how Vite resolves
# them and how `scripts/pricing-check.ts` and `scripts/ghl-config-check.ts` read them. It
# used to read `.env.local` only and exit if it was absent — which is a confusing failure
# for anyone who put their credentials in the file the README asks for.
#
# The credentials are added with --sensitive, which makes them write-only: Vercel will
# never show them again in the dashboard or the CLI. The rest are left readable on
# purpose — a project URL, a location id, an origin and two integers are not secrets, and
# being able to see them is worth more than hiding them when something misbehaves.
set -euo pipefail

TARGET="${1:-preview}"
ENV_FILES=(".env" ".env.local")

FOUND=0
for f in "${ENV_FILES[@]}"; do [ -f "$f" ] && FOUND=1; done
[ "$FOUND" = 1 ] || { echo "No .env or .env.local here. Run from the repo root."; exit 1; }
[ -d ".vercel" ] || { echo "Project not linked. Run 'vercel link' first."; exit 1; }

# PREFILL_API_KEY is sensitive and was missing: /api/prefill refuses every request without
# it, so a deployment that skipped it had prefilled links silently 401ing. PUBLIC_BASE_URL
# was missing for the same reason from the other side — it is the origin every minted link
# points at, and unset means the link names whichever deployment answered the call.
# SUPABASE_SERVICE_ROLE_KEY is the deprecated name and is listed only so a half-migrated
# .env still reaches Vercel. push() skips whatever is not set locally, so once the secret
# key replaces it in .env this line stops pushing it — then delete it from Vercel too.
SENSITIVE="SUPABASE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY PRICING_API_KEY GHL_PIT_TOKEN CRON_SECRET PREFILL_API_KEY"
READABLE="SUPABASE_URL GHL_LOCATION_ID PUBLIC_BASE_URL ABANDONMENT_IDLE_MINUTES ABANDONMENT_MAX_AGE_DAYS"

value_of() {
  # Last assignment across both files wins, quotes stripped, comments and blanks ignored
  for f in "${ENV_FILES[@]}"; do
    [ -f "$f" ] && grep -E "^$1=" "$f" || true
  done | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

push() {
  local name="$1" flag="$2" val
  val="$(value_of "$name")"

  if [ -z "$val" ]; then
    echo "  skip  $name (not set locally)"
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

echo "Pushing local env -> Vercel [$TARGET]"
for n in $SENSITIVE; do push "$n" "--sensitive"; done
for n in $READABLE;  do push "$n" ""; done

echo
echo "PRICING_API_URL and PRICING_PARITY_APPROVED are deliberately not pushed: both are"
echo "overrides, and unset means the code uses its documented default."
echo
echo "Check the target is the right project before trusting this — 'vercel link' points at"
echo "whatever you last linked, and these are one client's credentials."
echo "'vercel env ls $TARGET' to confirm; sensitive values show as hidden."
