#!/usr/bin/env bash
# Find or create a dedicated test simulator for the specified iOS runtime.
#
# Use the simulator's software keyboard for the test flows.
set -euo pipefail

defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false

runtime="${E2E_IOS_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-27-0}"
if ! xcrun simctl list runtimes --json |
  jq -e --arg runtime "$runtime" '.runtimes[] | select(.identifier == $runtime and .isAvailable)' >/dev/null; then
  echo "error: simulator runtime $runtime is not available." >&2
  exit 1
fi

device="$(xcrun simctl list devices available --json |
  jq -r --arg runtime "$runtime" '[.devices[$runtime][]? | select(.isAvailable and .name == "Kvitto End-to-End")] | first | .udid // empty')"

if [[ -z "$device" ]]; then
  device="$(xcrun simctl create 'Kvitto End-to-End' com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro "$runtime")"
fi

echo "$device"
