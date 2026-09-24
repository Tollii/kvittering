#!/usr/bin/env bash
# Install dependencies in fresh cloud sessions so agents can run the checks.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

if [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] &&
  { [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules/.package-lock.json ]]; }; then
  npm ci --no-audit --no-fund >&2
fi

echo "Verify changes with npm run check:changed while working and npm run check before committing. docs/verification.md explains how to add a check for new behavior."
