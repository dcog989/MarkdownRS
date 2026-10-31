#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: sync_version.sh <version>}"

apply() {
  local file="$1"
  shift
  local tmp
  tmp="$(mktemp)"
  sed "$@" "$file" > "$tmp"
  if cmp -s "$file" "$tmp"; then
    # Re-running for the version already in the file leaves it unchanged; that is not an error.
    if grep -qF "$version" "$tmp"; then
      rm -f "$tmp"
      return 0
    fi
    echo "error: no version replacement matched in $file" >&2
    rm -f "$tmp"
    exit 1
  fi
  cp "$tmp" "$file"
  rm -f "$tmp"
}

apply package.json "s|\"version\": \"[0-9][0-9.]*\"|\"version\": \"$version\"|"
apply src-tauri/Cargo.toml "s|^version = \".*\"|version = \"$version\"|"
apply src-tauri/Cargo.lock "/^name = \"markdownrs\"/{n;s|^version = \".*\"|version = \"$version\"|}"
apply PKGBUILD "s|^pkgver=.*|pkgver=$version|"
if [[ -f .pkg/PKGBUILD ]]; then
  apply .pkg/PKGBUILD "s|^pkgver=.*|pkgver=$version|"
fi