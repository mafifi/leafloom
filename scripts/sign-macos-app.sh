#!/bin/sh
set -eu
app="${1:?usage: sign-macos-app.sh <Leafloom.app> <identity>}"
identity="${2:?usage: sign-macos-app.sh <Leafloom.app> <identity>}"
[ "$identity" = 'Developer ID Application: Mostafa Afifi (QJJ98A74J8)' ] || { echo 'Unexpected signing identity' >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
host_node="$app/Contents/Resources/host/node"
[ -f "$host_node" ] || { echo 'Missing bundled Node runtime' >&2; exit 1; }
node "$root/scripts/inspect-macos-payloads.mjs" "$app"
# Sign the sole native host payload before the Rust shell seals its resources.
codesign --force --options runtime --timestamp --entitlements "$root/apps/desktop/src-tauri/host-entitlements.plist" --sign "$identity" "$host_node"
codesign --force --options runtime --timestamp --entitlements "$root/apps/desktop/src-tauri/Entitlements.plist" --sign "$identity" "$app"
codesign --verify --deep --strict "$app"
