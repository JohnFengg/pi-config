#!/usr/bin/env bash
# Build a single-file offline bundle of this pi config + all npm extensions.
#
# Run this on the ONLINE machine (where everything is installed). It produces
#   offline/pi-config-offline-<version>.tar.gz
# which you copy (USB drive, etc.) to the offline machine. See install-offline.sh.
#
# The bundle contains:
#   1. This repo's source (extensions/, themes/, config/, install.sh, ...)
#   2. A snapshot of ~/.pi/agent/npm (package.json + lock + node_modules) —
#      pi loads npm packages straight from this dir when the version range
#      matches, so an offline machine never needs to touch the network.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$REPO_DIR/package.json').version")"
OUT_DIR="$REPO_DIR/offline"
OUT="$OUT_DIR/pi-config-offline-$VERSION.tar.gz"
AGENT_NPM="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/npm"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT_DIR"
STAGE_BUNDLE="$STAGE/pi-config-offline-$VERSION"
mkdir -p "$STAGE_BUNDLE"

echo "==> Staging repo source..."
# Copy working tree (tracked files + untracked non-ignored files), minus .git and any prior bundles
rsync -a --exclude='.git' --exclude='offline/pi-config-offline-*.tar.gz' "$REPO_DIR/" "$STAGE_BUNDLE/pi-config/"

echo "==> Staging npm extensions snapshot ($AGENT_NPM)..."
if [ ! -d "$AGENT_NPM/node_modules" ]; then
  echo "error: $AGENT_NPM/node_modules not found — nothing to bundle" >&2
  exit 1
fi
rsync -a --exclude='node_modules/.cache' "$AGENT_NPM/" "$STAGE_BUNDLE/npm/"

echo "==> Compressing..."
tar czf "$OUT" -C "$STAGE" "pi-config-offline-$VERSION"
rm -f "$OUT_DIR/pi-config-offline-latest.tar.gz"
ln -sf "$(basename "$OUT")" "$OUT_DIR/pi-config-offline-latest.tar.gz"

echo
echo "Bundle: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Copy this single file to the offline machine, then run:"
echo "  tar xzf pi-config-offline-$VERSION.tar.gz && ./pi-config-offline-$VERSION/pi-config/install-offline.sh"
