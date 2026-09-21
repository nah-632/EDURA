#!/bin/sh
# Assemble the packages a Next.js build needs, by fetching tarballs directly.
#
# `npm install` for this tree could not complete in this environment (the iOS
# app kills long npm runs mid-resolution), so the two installs that DID finish
# (/tmp/deps, /tmp/cssmin) are reused and only the remaining packages are
# fetched by URL. Registry tarball URLs are stable and public, so this is
# deterministic - no resolution, no lockfile.
set -e
NM=/tmp/nm
REG=https://registry.npmjs.org

fetch() {
  # $1 = url path, $2 = destination directory
  url="$REG/$1"
  dest="$NM/$2"
  if [ -d "$dest" ] && [ -f "$dest/package.json" ]; then
    echo "skip  $2"
    return 0
  fi
  mkdir -p "$dest"
  tmp="/tmp/dl-$$.tgz"
  if curl -sSL --max-time 180 -o "$tmp" "$url"; then
    tar xzf "$tmp" -C "$dest" --strip-components=1
    rm -f "$tmp"
    echo "ok    $2"
  else
    echo "FAIL  $2 ($url)"
    rm -f "$tmp"
  fi
}

for p in "$@"; do
  path=$(echo "$p" | cut -d'|' -f1)
  dest=$(echo "$p" | cut -d'|' -f2)
  fetch "$path" "$dest"
done
