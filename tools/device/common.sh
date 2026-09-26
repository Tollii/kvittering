# Shared functions for the Revyl iOS device scripts. Source this file; do not run it.
#
# Revyl build versions are named "ios-<runtime version>-<UTC timestamp>". The runtime
# version is the expo-updates fingerprint, so a build matches the working tree exactly
# when its native code is compatible with the current JavaScript.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

export PATH="$HOME/.revyl/bin:$PATH"
if ! command -v revyl >/dev/null; then
  echo "Revyl CLI is not installed. Install it with: curl -fsSL https://revyl.com/install.sh | sh" >&2
  exit 1
fi

# Prints the iOS runtime version that EAS will assign to a build of the working tree.
resolve_runtime_version() {
  npx --no-install expo-updates runtimeversion:resolve --platform ios |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).runtimeVersion))'
}

# Prints the Revyl app ID of the iOS app from .revyl/config.yaml.
revyl_app_id() {
  sed -n 's/^ *app_id: *//p' .revyl/config.yaml | head -n 1
}
