#!/usr/bin/env bash
# Install this pi config on a machine:
#   1. Symlink agent config files from this repo into ~/.pi/agent
#   2. Register this directory as a local pi package (extensions + theme)
#
# Existing files are backed up with a timestamp suffix before being replaced.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

link() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    local backup="$dst.bak.$(date +%Y%m%d%H%M%S)"
    cp "$dst" "$backup"
    echo "backed up: $backup"
  fi
  ln -sfn "$src" "$dst"
  echo "linked: $dst -> $src"
}

for f in settings.json keybindings.json mcp.json models.json statusline.json pi-statusline.json APPEND_SYSTEM.md; do
  link "$REPO_DIR/config/$f" "$AGENT_DIR/$f"
done
link "$REPO_DIR/config/pi-permission-system.config.json" "$AGENT_DIR/extensions/pi-permission-system/config.json"

pi install "$REPO_DIR"

echo
echo "Done. Start a new pi session (or /reload) to pick everything up."
