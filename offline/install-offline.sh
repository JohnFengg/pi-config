#!/usr/bin/env bash
# Offline install of pi-config + all npm extensions on a machine with NO network.
#
# Prerequisites on the offline machine:
#   - Official pi already installed (npm install -g @earendil-works/pi-coding-agent)
#   - This bundle extracted (contains pi-config/ + npm/ snapshots)
#
# What this does:
#   1. Restores ~/.pi/agent/npm (package.json + lock + node_modules) from the
#      snapshot so pi finds every extension locally and never hits the network.
#   2. Runs the normal install.sh (links configs, registers this repo as a
#      local pi package, so extensions/ + themes/ load from this directory).
#   3. Recommends PI_OFFLINE=1 so pi never attempts network installs.
#
# Existing files under ~/.pi/agent/npm are backed up before being replaced.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_DIR="$BUNDLE_DIR/pi-config"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
AGENT_NPM="$AGENT_DIR/npm"
SNAPSHOT_NPM="$BUNDLE_DIR/npm"

if [ ! -d "$SNAPSHOT_NPM/node_modules" ]; then
  echo "error: $SNAPSHOT_NPM/node_modules not found — is this the extracted bundle?" >&2
  exit 1
fi
if ! command -v pi >/dev/null 2>&1; then
  echo "error: 'pi' not on PATH — install the official pi package first" >&2
  exit 1
fi

echo "==> Restoring npm extensions snapshot..."
if [ -d "$AGENT_NPM" ]; then
  local backup="$AGENT_NPM.bak.$(date +%Y%m%d%H%M%S)"
  mv "$AGENT_NPM" "$backup"
  echo "backed up: $backup"
fi
mkdir -p "$AGENT_DIR"
cp -R "$SNAPSHOT_NPM" "$AGENT_NPM"
echo "restored: $AGENT_NPM"

echo "==> Running pi-config install (configs + local package registration)..."
# Run from the repo dir so install.sh resolves relative paths correctly
(cd "$REPO_DIR" && PI_OFFLINE=1 bash ./install.sh)

echo
echo "Done. Notes:"
echo "  - Start pi with offline mode so it never tries the network for missing packages:"
echo "      export PI_OFFLINE=1"
echo "    (all 12 extensions are already present locally, so nothing is missing.)"
echo "  - Authenticate providers with /login (credentials are not in this bundle)."
