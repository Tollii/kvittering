#!/usr/bin/env bash
# Root flows start empty. Flows in .maestro/<fixture>/ use that named fixture.
set -euo pipefail
device="$1"
out="$2"
shopt -s nullglob
flows=(.maestro/*.yaml .maestro/*/*.yaml)
if [[ ${#flows[@]} -eq 0 ]]; then
  echo "error: no Maestro flows found." >&2
  exit 1
fi
for flow in "${flows[@]}"; do
  name="${flow#.maestro/}"
  name="${name%.yaml}"
  result="$out/flows/$name"
  fixture=""
  if [[ "$name" == */* ]]; then fixture="${name%%/*}"; fi
  mkdir -p "$result"
  echo "▸ Preparing $flow (${fixture:-empty})"
  # Stop subscriptions before replacing data, then clear local app state in
  # the flow's launchApp command. The backend reset also removes old sessions.
  xcrun simctl terminate "$device" no.tolnes.kvitto 2>/dev/null || true
  if ! node tools/e2e/seed.mts "$fixture" "$result/seed" >"$result/seed.log" 2>&1; then
    cat "$result/seed.log" >&2
    exit 1
  fi
  account=(--env "E2E_EMAIL=e2e-$(date +%s)@example.com")
  if [[ -n "$fixture" ]]; then
    account=(--env "E2E_EMAIL=$(jq -r .email "$result/seed/account.json")"
      --env "E2E_PASSWORD=$(jq -r .password "$result/seed/account.json")")
  fi
  maestro --device "$device" test "$flow" "${account[@]}" \
    --format junit --output "$result/maestro.xml" --debug-output "$result/maestro"
done
