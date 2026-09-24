#!/usr/bin/env bash
# Run the Maestro flows in .maestro/ against a Release iOS Simulator build and
# a local Convex backend with the mock receipt provider. Requires macOS with
# Xcode and Maestro. Use a checkout without a personal .env.local, such as a
# separate worktree, so the flows never reach a shared deployment.
#
# E2E_APP_CACHE: optional path of a previously built kvitto.app for the same
# native fingerprint; its JavaScript bundle is replaced instead of rebuilding.
#
# The app is signed ad hoc, as Xcode's "Sign to Run Locally" does: without
# entitlements the Keychain refuses expo-secure-store and the app stops.
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
# A query may run for one second. While the simulator starts, the runner's few
# cores leave the app's first queries short of that, so allow ten locally.
DATABASE_UDF_USER_TIMEOUT_SECONDS=10 CONVEX_AGENT_MODE=anonymous npx convex dev --typecheck disable >"$out/convex.log" 2>&1 &
convex_pid=$!
trap 'kill "$convex_pid" 2>/dev/null || true' EXIT

# The first boot of a fresh simulator takes minutes; let it run meanwhile.
# E2E_DEVICE: a simulator the caller already started booting.
device="${E2E_DEVICE:-$(tools/e2e/simulator.sh)}"
echo "▸ Booting simulator $device in the background"
xcrun simctl boot "$device" 2>/dev/null || true

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
  codesign -d --entitlements - --xml "$app" >"$out/entitlements.plist" 2>/dev/null
  npx expo export:embed --platform ios --dev false --bytecode \
    --entry-file node_modules/expo-router/entry.js \
    --bundle-output "$app/main.jsbundle" --assets-dest "$app"
  # The new bundle invalidates the signature that carries the entitlements.
  codesign --force --sign - --entitlements "$out/entitlements.plist" \
    --timestamp=none "$app"
else
  echo "▸ Building the app for the iOS Simulator with $(xcodebuild -version | awk 'NR == 1')"
  npx expo prebuild --platform ios --clean
  # Installed updates would replace the JavaScript under test.
  plutil -replace EXUpdatesEnabled -bool NO ios/kvitto/Supporting/Expo.plist
  if ! xcodebuild -workspace ios/kvitto.xcworkspace -scheme kvitto \
    -configuration Release -sdk iphonesimulator \
    -destination "generic/platform=iOS Simulator" \
    -derivedDataPath build/derived \
    CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= \
    PROVISIONING_PROFILE_SPECIFIER= ONLY_ACTIVE_ARCH=YES \
    >"$out/xcodebuild.log" 2>&1; then
    grep -E -A 20 "error:|BUILD FAILED|Command .* failed" "$out/xcodebuild.log" | head -n 150 >&2
    echo "error: the simulator build failed; the full log is $out/xcodebuild.log." >&2
    exit 1
  fi
  rm -rf "$app"
  cp -R build/derived/Build/Products/Release-iphonesimulator/kvitto.app "$app"
fi

echo "▸ Waiting for the simulator"
xcrun simctl bootstatus "$device" -b >/dev/null
# Maestro installs its driver on first use; do that while the app installs.
maestro --device "$device" hierarchy >/dev/null 2>&1 &
driver_pid=$!
xcrun simctl install "$device" "$app"
wait "$driver_pid" || true

echo "▸ Running Maestro flows"
if ! maestro --device "$device" test .maestro \
  --env E2E_EMAIL="e2e-$(date +%s)@example.com" \
  --format junit --output "$out/maestro.xml" \
  --debug-output "$out/maestro" --flatten-debug-output; then
  echo "Failed step:" >&2
  grep -oE '<failure[^>]*>[^<]*' "$out/maestro.xml" >&2 || true
  # Name what the screen showed; screenshots are in the uploaded artifact.
  echo "Visible text when the flow failed:" >&2
  maestro --device "$device" hierarchy >"$out/hierarchy.json" 2>/dev/null || true
  grep -oE '"(text|accessibilityText|hintText)" *: *"[^"]+"' "$out/hierarchy.json" | sort -u | head -n 60 >&2 || true
  # A launch crash leaves a report and the app's last log lines.
  report="$(find "$HOME/Library/Logs/DiagnosticReports" -name 'kvitto*' -newer "$out/convex.log" 2>/dev/null | head -n 1)"
  if [[ -n "$report" ]]; then
    cp "$report" "$out/"
    echo "Crash report $report:" >&2
    head -c 6000 "$report" >&2
  fi
  xcrun simctl spawn "$device" log show --last 10m --style compact \
    --predicate 'process == "kvitto"' 2>/dev/null >"$out/app.log" || true
  echo "Last app log lines:" >&2
  grep -E "com.facebook.react.log|Unhandled|Terminating|ReactNativeJS" "$out/app.log" |
    tail -n 40 >&2 || true
  echo "Backend log:" >&2
  grep -vE "^\s*$" "$out/convex.log" | tail -n 60 >&2 || true
  exit 1
fi
