#!/usr/bin/env bash
# Print the UDID of the newest available iPhone simulator.
#
# With a hardware keyboard connected, typing into a secure text field keeps
# only the first character, so flows could not enter passwords. Disconnect it
# before the simulator boots.
set -euo pipefail

defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false

xcrun simctl list devices available --json |
  jq -r '[.devices | to_entries[] | select(.key | contains("iOS")) | .value[] | select(.name | startswith("iPhone"))] | last | .udid'
