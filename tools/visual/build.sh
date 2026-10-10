#!/usr/bin/env bash
# Export the web version of the app for tools/visual/serve.mts. A warm export
# takes seconds, so rerun this after a source change that needs no new data;
# open pages pick up the new build when they reload.
set -euo pipefail

cd "$(dirname "$0")/../.."
out="${VISUAL_OUTPUT:-build/visual}"
port="${VISUAL_PORT:-8081}"
mkdir -p "$out"

# The export inlines EXPO_PUBLIC_* values, and Metro's cache can keep an
# earlier export's values, so clear it when they, the .env files, the bundler
# config, or the packages change. The site routes are proxied through the web
# server.
values="EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
EXPO_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:$port"
inputs="$values
$(git ls-files -co --exclude-standard metro.config.js package-lock.json ".env*" |
  while read -r file; do [[ -f "$file" ]] && echo "$file $(git hash-object "$file")"; done)"
clear=()
if [[ "$(cat "$out/web.env" 2>/dev/null)" != "$inputs" ]]; then clear=(--clear); fi

echo "▸ Exporting the web build" >&2
rm -rf "$out/web.next"
if ! env $values EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true \
  npx expo export --platform web "${clear[@]}" --output-dir "$out/web.next" \
  >"$out/export.log" 2>&1 </dev/null; then
  tail -n 40 "$out/export.log" >&2
  exit 1
fi
echo "$inputs" >"$out/web.env"
rm -rf "$out/web"
mv "$out/web.next" "$out/web"
