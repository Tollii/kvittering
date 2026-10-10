#!/usr/bin/env bash
# Build the web version of the app and serve it with a local backend for
# browser checks. Prints the app URL when it is ready. Rerun after backend
# changes; after app changes, tools/visual/build.sh is enough. Unchanged
# functions are not deployed again. Each start resets the data to an
# end-to-end fixture:
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

tools/visual/build.sh </dev/null

pkill -f "tools/visual/serve.mts $out/web $port" 2>/dev/null || true
(nohup node tools/visual/serve.mts "$out/web" "$port" >"$out/serve.log" 2>&1 &) \
  </dev/null >/dev/null 2>&1
for _ in $(seq 1 20); do
  if curl -fs -o /dev/null "$origin/"; then break; fi
  sleep 0.5
done
curl -fsS -o /dev/null "$origin/"
echo "$origin"
