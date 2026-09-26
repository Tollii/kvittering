#!/usr/bin/env bash
# Build the web version of the app and serve it with a local backend for
# browser checks. Prints the app URL when it is ready. Rerun after source
# changes. Each start resets the data to an end-to-end fixture:
# VISUAL_FIXTURE names one in tools/e2e/fixtures (default reviewed-receipts);
# set it empty to start without data. Its account is in build/visual/seed.
set -euo pipefail

cd "$(dirname "$0")/../.."
out="${VISUAL_OUTPUT:-build/visual}"
port="${VISUAL_PORT:-8081}"
origin="http://127.0.0.1:$port"
mkdir -p "$out"

VISUAL_WEB_ORIGIN="$origin" tools/visual/backend.sh >/dev/null </dev/null

fixture="${VISUAL_FIXTURE-reviewed-receipts}"
echo "▸ Seeding ${fixture:-an empty database}" >&2
if ! VISUAL_ENV_FILE="$out/convex.env" node tools/e2e/seed.mts "$fixture" "$out/seed" \
  >"$out/seed.log" 2>&1 </dev/null; then
  tail -n 40 "$out/seed.log" >&2
  exit 1
fi

echo "▸ Exporting the web build" >&2
rm -rf "$out/web"
# The export inlines EXPO_PUBLIC_* values; --clear keeps an earlier export's
# values out of the bundle. Site routes are proxied through the web server.
if ! EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true \
  EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 \
  EXPO_PUBLIC_CONVEX_SITE_URL="$origin" \
  npx expo export --platform web --clear --output-dir "$out/web" \
  >"$out/export.log" 2>&1 </dev/null; then
  tail -n 40 "$out/export.log" >&2
  exit 1
fi

pkill -f "tools/visual/serve.mts $out/web $port" 2>/dev/null || true
nohup node tools/visual/serve.mts "$out/web" "$port" </dev/null >"$out/serve.log" 2>&1 &
for _ in $(seq 1 20); do
  if curl -fs -o /dev/null "$origin/"; then break; fi
  sleep 0.5
done
curl -fsS -o /dev/null "$origin/"
echo "$origin"
