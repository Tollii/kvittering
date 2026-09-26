#!/usr/bin/env bash
# Start a disposable local Convex backend for the web build and deploy this
# checkout's functions to it. Runs the Convex local-backend binary directly, as
# a self-hosted deployment, so it needs neither a Convex account nor
# version.convex.dev. The mock receipt provider replaces paid extraction.
#
# Prints the CLI environment file path; source it before other convex commands.
# VISUAL_OUTPUT: state directory (default build/visual). VISUAL_RESET=1 clears
# the database first.
set -euo pipefail

cd "$(dirname "$0")/../.."
out="${VISUAL_OUTPUT:-build/visual}"
state="$out/backend"
env_file="$out/convex.env"
web_origin="${VISUAL_WEB_ORIGIN:-http://127.0.0.1:8081}"
mkdir -p "$state"

if [[ "${VISUAL_RESET:-}" == 1 ]]; then
  pkill -f "$PWD/$state" 2>/dev/null || true
  rm -rf "$state"
  mkdir -p "$state"
fi

binary="$(find "$HOME/.cache/convex/binaries" -name convex-local-backend -type f 2>/dev/null | sort | tail -n 1)"
if [[ -z "$binary" ]]; then
  echo "▸ Downloading the Convex local backend" >&2
  asset="convex-local-backend-x86_64-unknown-linux-gnu.zip"
  # The latest-release redirect names the version without the GitHub API.
  url="$(curl -fsS -o /dev/null -w '%{redirect_url}' \
    "https://github.com/get-convex/convex-backend/releases/latest/download/$asset")"
  version="$(basename "$(dirname "$url")")"
  mkdir -p "$HOME/.cache/convex/binaries/$version"
  curl -fsSL -o "$state/backend.zip" "$url"
  unzip -o -q "$state/backend.zip" -d "$HOME/.cache/convex/binaries/$version"
  rm "$state/backend.zip"
  binary="$HOME/.cache/convex/binaries/$version/convex-local-backend"
  chmod +x "$binary"
fi

: >"$out/convex-cli.log"
if [[ ! -f "$state/instance-secret" ]]; then
  openssl rand -hex 32 >"$state/instance-secret"
fi
secret="$(cat "$state/instance-secret")"
name="kvitto-visual"

if ! curl -fsS -o /dev/null http://127.0.0.1:3210/version 2>/dev/null; then
  echo "▸ Starting the local backend" >&2
  (cd "$state" && nohup "$binary" --instance-name "$name" --instance-secret "$secret" \
    --port 3210 --site-proxy-port 3211 --local-storage "$PWD/storage" \
    --disable-beacon "$PWD/backend.sqlite3" >"$PWD/backend.log" 2>&1 &)
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null http://127.0.0.1:3210/version 2>/dev/null; then break; fi
    sleep 1
  done
fi
curl -fsS -o /dev/null http://127.0.0.1:3210/version || {
  tail -n 40 "$state/backend.log" >&2
  echo "error: the local backend did not start." >&2
  exit 1
}

admin_key="$("$binary" keygen admin-key --instance-name "$name" --instance-secret "$secret")"
cat >"$env_file" <<EOF
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=$admin_key
EOF

convex() {
  # A personal CONVEX_DEPLOYMENT must not redirect these commands.
  env -u CONVEX_DEPLOYMENT npx convex "$@" --env-file "$env_file" 2>>"$out/convex-cli.log"
}

echo "▸ Deploying functions" >&2
if ! convex env list --names-only 2>/dev/null | grep -qx BETTER_AUTH_SECRET; then
  convex env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)" >/dev/null
fi
convex env set RECEIPT_PROVIDER mock >/dev/null
convex env set RELEASE_CHANNEL development >/dev/null
convex env set SITE_URL "$web_origin" >/dev/null
convex deploy --yes --typecheck disable >/dev/null || {
  tail -n 40 "$out/convex-cli.log" >&2
  exit 1
}

# Local accounts use email; paid catalog, matching, and analysis stay off.
flags="$out/featureFlags.json"
cat >"$flags" <<'EOF'
[
  {"platform":"ios","channel":"development","revision":1,"values":{"emailSignUp":true,"receiptProcessing":true,"productLookup":false,"automaticProductMatching":false,"spendingAnalysis":false}},
  {"platform":"android","channel":"development","revision":1,"values":{"emailSignUp":true,"receiptProcessing":true,"productLookup":false,"automaticProductMatching":false,"spendingAnalysis":false}}
]
EOF
convex import --yes --replace --table featureFlags "$flags" >/dev/null

echo "$env_file"
