#!/usr/bin/env bash
# Deploys the working tree's Convex functions to a disposable preview deployment for
# this branch and seeds it with an end-to-end fixture: an account, a household, and
# its data. Writes build/device/backend.env for start_ios_session.sh and the account
# to build/device/seed/account.json. A rerun replaces the deployment and its data.
#
# Usage: tools/device/create_backend.sh [fixture]   (default: reviewed-receipts)
#
# Requires CONVEX_DEPLOY_KEY to be a preview deploy key. The project's default
# environment variables for previews supply BETTER_AUTH_SECRET, RECEIPT_PROVIDER=mock,
# and RELEASE_CHANNEL=development (`npx convex env default set --type preview ...`).

source "$(dirname "$0")/common.sh"

fixture="${1:-reviewed-receipts}"

if [[ "${CONVEX_DEPLOY_KEY:-}" != preview:* ]]; then
  echo "CONVEX_DEPLOY_KEY must be a preview deploy key." >&2
  exit 1
fi

branch="$(git branch --show-current)"
# Sanitizing and truncation can map two branches to one name, and --preview-create
# would then replace the other branch's deployment. The hash keeps names distinct.
readable="$(tr '[:upper:]' '[:lower:]' <<<"$branch" | tr -c 'a-z0-9\n' '-' | cut -c 1-30)"
name="device-${readable%-}-$(git hash-object --stdin <<<"$branch" | cut -c 1-8)"
output="build/device"
mkdir -p "$output"
# A failed rerun must not leave the URL of the replaced deployment for start_ios_session.sh.
rm -f "$output/backend.env" "$output/convex-url"

# --cmd runs after the preview deployment exists and receives its URL.
npx convex deploy --preview-create "$name" --typecheck disable \
  --cmd-url-env-var-name CONVEX_URL \
  --cmd "node -e 'require(\"fs\").writeFileSync(\"$output/convex-url\", process.env.CONVEX_URL)'"

url="$(cat "$output/convex-url")"
site="${url/.convex.cloud/.convex.site}"

SEED_PREVIEW_NAME="$name" \
  SEED_PREVIEW_DEPLOYMENT="$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$url")" \
  SEED_SITE_URL="$site" node tools/e2e/seed.mts "$fixture" "$output/seed"

cat >"$output/backend.env" <<EOF
EXPO_PUBLIC_CONVEX_URL=$url
EXPO_PUBLIC_CONVEX_SITE_URL=$site
EXPO_PUBLIC_RELEASE_CHANNEL=development
EOF
echo "Backend ready: $url"
echo "Account: $(node -e 'console.log(require("./build/device/seed/account.json").email)')"
