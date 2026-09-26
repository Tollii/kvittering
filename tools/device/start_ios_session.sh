#!/usr/bin/env bash
# Starts a Revyl cloud iPhone with the dev client that matches the current native
# fingerprint, and serves the working tree's JavaScript to it from Metro with hot reload.
# Prints the session JSON (session_id, viewer_url). Stop the session with `revyl dev stop`.
#
# Exit status 3 means that no matching build exists; run build_ios_binary.sh first.

source "$(dirname "$0")/common.sh"

runtime_version="$(resolve_runtime_version)"

build_version_id="$(
  revyl build list --app "$(revyl_app_id)" --json |
    node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const prefix = `ios-${process.argv[1]}-`;
        const match = JSON.parse(s).versions
          .filter((v) => v.version.startsWith(prefix))
          .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];
        console.log(match?.id ?? "");
      });
    ' "$runtime_version"
)"

if [[ -z "$build_version_id" ]]; then
  echo "No Revyl build matches iOS runtime version $runtime_version." >&2
  echo "Native code changed. Run tools/device/build_ios_binary.sh, then run this script again." >&2
  exit 3
fi

# Metro reads the backend URLs from the environment. Use the preview deployment that
# create_backend.sh made; never fall back to a shared deployment.
if [[ ! -f build/device/backend.env ]]; then
  echo "No backend for this session. Run tools/device/create_backend.sh first." >&2
  exit 1
fi
set -a
source build/device/backend.env
set +a

revyl dev --no-build --build-version-id "$build_version_id" --platform ios --no-open --detach --json
