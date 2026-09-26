#!/usr/bin/env bash
# Setup script for Linux cloud agent environments. It installs the tools that the
# device-check skill uses: the Revyl CLI, ffmpeg, and, when run from the repository,
# the npm dependencies. Rerunning it is safe.
#
# Secrets come from the environment, never from files:
#   REVYL_API_KEY        Revyl CLI authentication (required for device sessions)
#   CONVEX_DEPLOY_KEY    Convex preview deploy key, for the per-branch backend
#   EXPO_TOKEN           EAS authentication (required only for new native builds)
#
# REVYL_VERSION pins the CLI version; update it deliberately.
set -euo pipefail

revyl_version="${REVYL_VERSION:-v0.1.128}"

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

if [[ "$(revyl --version 2>/dev/null)" != *"$revyl_version"* ]]; then
  echo "▸ Installing Revyl CLI $revyl_version"
  curl -fsSL https://revyl.com/install.sh -o /tmp/revyl-install.sh
  # /usr/local/bin is on PATH in every agent shell, so no profile edit is necessary.
  as_root env REVYL_VERSION="$revyl_version" REVYL_INSTALL_DIR=/usr/local/bin \
    REVYL_NO_MODIFY_PATH=1 sh /tmp/revyl-install.sh
fi

if ! command -v ffmpeg >/dev/null; then
  echo "▸ Installing ffmpeg"
  as_root apt-get update -qq
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg >/dev/null
fi

if [[ -f package-lock.json ]]; then
  echo "▸ Installing npm dependencies"
  npm ci --no-audit --no-fund
fi

for name in REVYL_API_KEY CONVEX_DEPLOY_KEY EXPO_TOKEN; do
  if [[ -z "${!name:-}" ]]; then
    echo "warning: $name is not set; the device-check skill cannot use every step." >&2
  fi
done

if [[ -n "${REVYL_API_KEY:-}" ]]; then
  revyl auth status
fi
