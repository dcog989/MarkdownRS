#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: sync_version.sh <version>}"

sed -i "s/\"version\": \"[0-9][0-9.]*\"/\"version\": \"$version\"/" package.json src-tauri/tauri.conf.json
sed -i "s/^version = \".*/version = \"$version\"/" src-tauri/Cargo.toml
sed -i "/^name = \"markdown-rs\"/{n;s/^version = \".*/version = \"$version\"/}" src-tauri/Cargo.lock
sed -i "s/^pkgver=.*/pkgver=$version/" PKGBUILD