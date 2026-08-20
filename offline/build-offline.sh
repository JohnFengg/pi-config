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
#   3. Linux fd/ripgrep binaries (x86_64 + aarch64) into bin/linux/ — pi
#      needs fd for @ file autocomplete and rg for grep; on an offline
#      machine ensureTool() skips its GitHub download, so we ship them.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$REPO_DIR/package.json').version")"
OUT_DIR="$REPO_DIR/offline"
OUT="$OUT_DIR/pi-config-offline-$VERSION.tar.gz"
AGENT_NPM="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/npm"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

FD_VERSION="10.4.2"
RG_VERSION="15.2.0"

mkdir -p "$OUT_DIR"
STAGE_BUNDLE="$STAGE/pi-config-offline-$VERSION"
mkdir -p "$STAGE_BUNDLE"

# Download and extract Linux tool binaries into bin/linux/<tool>/
# (musl builds run on glibc distros; matches what pi itself would fetch)
download_tool() {
  local tool="$1" repo="$2" version="$3" asset="$4" dir="$5"
  local url="https://github.com/$repo/releases/download/$version/$asset"
  local tmp="$STAGE/dl-$tool.tmp"
  echo "==> Downloading $tool $version ($asset)..."
  curl -fL --retry 3 -o "$tmp" "$url"
  mkdir -p "$dir"
  tar xzf "$tmp" -C "$dir" --strip-components=1
  rm -f "$tmp"
}

mkdir -p "$STAGE_BUNDLE/bin/linux/fd" "$STAGE_BUNDLE/bin/linux/rg"
for arch in x86_64 aarch64; do
  if [ "$arch" = "x86_64" ]; then
    download_tool fd sharkdp/fd v$FD_VERSION fd-v$FD_VERSION-x86_64-unknown-linux-gnu.tar.gz "$STAGE_BUNDLE/bin/linux/fd/x86_64"
    download_tool rg BurntSushi/ripgrep $RG_VERSION ripgrep-$RG_VERSION-x86_64-unknown-linux-musl.tar.gz "$STAGE_BUNDLE/bin/linux/rg/x86_64"
  else
    download_tool fd sharkdp/fd v$FD_VERSION fd-v$FD_VERSION-aarch64-unknown-linux-gnu.tar.gz "$STAGE_BUNDLE/bin/linux/fd/aarch64"
    download_tool rg BurntSushi/ripgrep $RG_VERSION ripgrep-$RG_VERSION-aarch64-unknown-linux-musl.tar.gz "$STAGE_BUNDLE/bin/linux/rg/aarch64"
  fi
  chmod +x "$STAGE_BUNDLE/bin/linux/fd/$arch/fd" "$STAGE_BUNDLE/bin/linux/rg/$arch/rg"
done

# Keep only the binaries (drop man pages, completions, licenses)
find "$STAGE_BUNDLE/bin/linux" -type f ! -name 'fd' ! -name 'rg' -delete
find "$STAGE_BUNDLE/bin/linux" -type d -empty -delete 2>/dev/null || true

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
