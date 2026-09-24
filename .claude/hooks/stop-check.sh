#!/usr/bin/env bash
# Keep an agent working while the files it changed fail the fast checks.
# A passing state is remembered, so an unchanged tree is not checked twice.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0

# A second stop in the same turn means the agent already saw the failure.
if grep -q '"stop_hook_active":[[:space:]]*true'; then exit 0; fi

if [[ ! -d node_modules ]]; then exit 0; fi

state="$({
  git rev-parse HEAD
  git diff HEAD
  git ls-files --others --exclude-standard | while read -r file; do git hash-object "$file"; done
} 2>/dev/null | git hash-object --stdin)"
marker="$(git rev-parse --git-dir)/claude-check-passed"

if [[ -f "$marker" && "$(cat "$marker")" == "$state" ]]; then exit 0; fi

if output="$(npm run --silent check:changed 2>&1)"; then
  echo "$state" >"$marker"
  exit 0
fi

{
  echo "npm run check:changed failed for the files changed on this branch. Fix these findings before finishing:"
  echo "$output" | tail -n 80
} >&2
exit 2
