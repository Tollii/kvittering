#!/usr/bin/env bash
# Builds the iOS simulator dev client for the current native fingerprint and uploads it
# to Revyl. Run it only when start_ios_session.sh reports that no matching build exists.
#
# macOS: builds on this machine with `eas build --local` (needs Xcode).
# Linux: reuses an EAS cloud build with the same fingerprint, or starts one (needs EXPO_TOKEN).

source "$(dirname "$0")/common.sh"

runtime_version="$(resolve_runtime_version)"
artifact=".revyl/build/app.tar.gz"
mkdir -p "$(dirname "$artifact")"
rm -f "$artifact"

if [[ "$(uname)" == "Darwin" ]]; then
  npx --yes eas-cli build --platform ios --profile revyl-build --local --non-interactive --output "$artifact"
else
  # An authentication or network error stops the script here. Only an empty result
  # starts a new cloud build.
  existing="$(
    npx --yes eas-cli build:list --platform ios --simulator --status finished \
      --fingerprint-hash "$runtime_version" --limit 1 --json --non-interactive |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))'
  )"
  if [[ "$existing" == 0 ]]; then
    echo "No EAS build exists for fingerprint $runtime_version. Starting an EAS cloud build." >&2
    npx --yes eas-cli build --platform ios --profile revyl-build --non-interactive --wait
  fi
  result="$(npx --yes eas-cli build:download --platform ios --dev-client --fingerprint "$runtime_version" --json)"
  path="$(node -e 'console.log(JSON.parse(process.argv[1]).path)' "$result")"
  # Revyl expects a tar.gz archive with the .app bundle at its root.
  if [[ -d "$path" ]]; then
    tar -czf "$artifact" -C "$(dirname "$path")" "$(basename "$path")"
  else
    cp "$path" "$artifact"
  fi
fi

# The "prebuilt" profile only uploads the artifact. Uploading through `revyl build`
# records the Expo dev-client metadata that `revyl dev` requires; `revyl build upload` does not.
revyl build --local --profile prebuilt --platform ios \
  --version "ios-$runtime_version-$(date -u +%Y%m%d%H%M%S)"
