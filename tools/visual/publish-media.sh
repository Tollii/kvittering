#!/usr/bin/env bash
# Publish screenshots, GIFs, and MP4s for a pull request description and print
# the Markdown that shows them. GitHub's attachment upload is unavailable in
# cloud sessions, so media goes to the `pr-media` branch, which never merges
# into main (see its README). Links pin the commit, so later pushes keep them.
#
# Usage: tools/visual/publish-media.sh <media-dir>...
set -euo pipefail

cd "$(dirname "$0")/../.."
branch="$(git rev-parse --abbrev-ref HEAD)"
repo="Tollii/kvittering"
work="$(mktemp -d)"
trap 'git worktree remove --force "$work" >/dev/null 2>&1 || true' EXIT

git fetch -q origin pr-media
git worktree add -q --detach "$work" origin/pr-media

shopt -s nullglob
for dir in "$@"; do
  dest="$work/$branch/$(basename "$dir")"
  mkdir -p "$dest"
  for file in "$dir"/*.png "$dir"/*.gif "$dir"/*.mp4; do cp "$file" "$dest/"; done
done

git -C "$work" add -A
git -C "$work" commit -q -m "Media for $branch [skip ci]"
# Other threads append to the same branch; replay this commit on theirs.
for attempt in 1 2 3; do
  if git -C "$work" push -q origin HEAD:pr-media; then break; fi
  if [[ $attempt == 3 ]]; then exit 1; fi
  git -C "$work" pull -q --rebase origin pr-media
done
sha="$(git -C "$work" rev-parse HEAD)"

for dir in "$@"; do
  path="$branch/$(basename "$dir")"
  for file in "$work/$path"/*.png "$work/$path"/*.gif; do
    name="$(basename "$file")"
    echo "![${name%.*}](https://raw.githubusercontent.com/$repo/$sha/$path/$name)"
  done
  for file in "$work/$path"/*.mp4; do
    name="$(basename "$file")"
    echo "[Play ${name%.*} in the browser](https://cdn.jsdelivr.net/gh/$repo@$sha/$path/$name)"
  done
done
