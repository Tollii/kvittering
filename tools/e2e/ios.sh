#!/usr/bin/env bash
# Run the Maestro flows in .maestro/ against a Release iOS Simulator build and
# a local Convex backend with the mock receipt provider. Requires macOS with
# Xcode and Maestro. Use a checkout without a personal .env.local, such as a
# separate worktree, so the flows never reach a shared deployment.
#
# E2E_APP_CACHE: optional path of a previously built kvitto.app for the same
# native fingerprint; its JavaScript bundle is replaced instead of rebuilding.
set -euo pipefail

cd "$(dirname "$0")/../.."
out="${E2E_OUTPUT:-build/e2e}"
app="build/kvitto.app"
mkdir -p "$out"

if [[ -f .env.local ]] && ! grep -q "^CONVEX_DEPLOYMENT=anonymous" .env.local; then
  echo "error: .env.local selects a shared Convex deployment. Run end-to-end tests in a separate worktree without it." >&2
  exit 1
fi

export SENTRY_DISABLE_AUTO_UPLOAD=true
export EXPO_NO_TELEMETRY=1

echo "▸ Starting a local Convex backend"
CONVEX_AGENT_MODE=anonymous npx convex dev --typecheck disable >"$out/convex.log" 2>&1 &
convex_pid=$!
trap 'kill "$convex_pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 150); do
  if grep -q "Convex functions ready" "$out/convex.log"; then break; fi
  if ! kill -0 "$convex_pid" 2>/dev/null; then
    cat "$out/convex.log" >&2
    echo "error: the local Convex backend stopped." >&2
    exit 1
  fi
  sleep 2
done

if ! grep -q "Convex functions ready" "$out/convex.log"; then
  cat "$out/convex.log" >&2
  echo "error: the local Convex backend did not become ready in 5 minutes." >&2
  exit 1
fi

npx convex env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)" >/dev/null
npx convex env set RECEIPT_PROVIDER mock >/dev/null
grep "^EXPO_PUBLIC_CONVEX" .env.local

if [[ -n "${E2E_APP_CACHE:-}" && -d "$E2E_APP_CACHE" ]]; then
  echo "▸ Reusing the native build; embedding the current JavaScript"
  rm -rf "$app"
  cp -R "$E2E_APP_CACHE" "$app"
  npx expo export:embed --platform ios --dev false --bytecode \
    --entry-file node_modules/expo-router/entry.js \
    --bundle-output "$app/main.jsbundle" --assets-dest "$app"
else
  echo "▸ Building the app for the iOS Simulator with $(xcodebuild -version | awk 'NR == 1')"
  npx expo prebuild --platform ios --clean
  # Installed updates would replace the JavaScript under test.
  plutil -replace EXUpdatesEnabled -bool NO ios/kvitto/Supporting/Expo.plist
  if ! xcodebuild -workspace ios/kvitto.xcworkspace -scheme kvitto \
    -configuration Release -sdk iphonesimulator \
    -destination "generic/platform=iOS Simulator" \
    -derivedDataPath build/derived \
    CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES \
    >"$out/xcodebuild.log" 2>&1; then
    grep -E -A 20 "error:|BUILD FAILED|Command .* failed" "$out/xcodebuild.log" | head -n 150 >&2
    echo "error: the simulator build failed; the full log is $out/xcodebuild.log." >&2
    exit 1
  fi
  rm -rf "$app"
  cp -R build/derived/Build/Products/Release-iphonesimulator/kvitto.app "$app"
fi

echo "▸ Booting a simulator"
device="$(xcrun simctl list devices available --json |
  jq -r '[.devices | to_entries[] | select(.key | contains("iOS")) | .value[] | select(.name | startswith("iPhone"))] | last | .udid')"
xcrun simctl boot "$device" 2>/dev/null || true
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$app"

echo "▸ Running Maestro flows"
if ! maestro --device "$device" test .maestro \
  --env E2E_EMAIL="e2e-$(date +%s)@example.com" \
  --format junit --output "$out/maestro.xml" \
  --debug-output "$out/maestro"; then
  # Name what the screen showed; screenshots are in the uploaded artifact.
  echo "Visible text when the flow failed:" >&2
  maestro --device "$device" hierarchy >"$out/hierarchy.json" 2>/dev/null || true
  grep -oE '"(text|accessibilityText|hintText)" *: *"[^"]+"' "$out/hierarchy.json" | sort -u | head -n 60 >&2 || true
  exit 1
fi
