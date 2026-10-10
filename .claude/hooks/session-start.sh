#!/usr/bin/env bash
# Install dependencies in fresh cloud sessions so agents can run the checks.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# A cached container can keep node_modules from an older lockfile with a newer
# modification time, so compare the lockfile's contents instead.
if [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]]; then
  lock="$(git hash-object package-lock.json)"
  if [[ "$(cat node_modules/.installed-lock 2>/dev/null)" != "$lock" ]]; then
    npm ci --no-audit --no-fund >&2
    echo "$lock" >node_modules/.installed-lock
  fi
fi

echo "Verify changes with npm run check:changed while working and npm run check before committing. docs/verification.md explains how to add a check for new behavior."
