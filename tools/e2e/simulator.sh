#!/usr/bin/env bash
# Print the UDID of the newest available iPhone simulator.
set -euo pipefail

xcrun simctl list devices available --json |
  jq -r '[.devices | to_entries[] | select(.key | contains("iOS")) | .value[] | select(.name | startswith("iPhone"))] | last | .udid'
