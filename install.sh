#!/usr/bin/env bash
# Install this pi config on a machine:
#   1. Install agent config files from this repo into ~/.pi/agent
#      (settings.json is COPIED, not symlinked: it records this machine's
#      local package path, which pi normalizes relative to ~/.pi/agent)
#   2. Symlink the fd global ignore file (kills macOS ._*/.DS_Store noise in @ file search)
#   3. Point git's global excludesFile at this repo's copy
#   4. Register this directory as a local pi package (extensions + theme)
#
# Existing files are backed up with a timestamp suffix before being replaced.
# After installation, run `pi` once — packages listed in settings.json are
# auto-installed on first start. Provider credentials are NOT included:
# run `/login` inside pi (or `pi login`) to authenticate.
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

copy() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ]; then
    local backup="$dst.bak.$(date +%Y%m%d%H%M%S)"
    cp "$dst" "$backup"
    echo "backed up: $backup"
  fi
  cp "$src" "$dst"
  echo "copied: $dst <- $src"
}

# pi agent config
# settings.json is COPIED (not symlinked): it records machine-specific state
# such as the local package path for this repo. The template ships without a
# local path entry; `pi install "$REPO_DIR"` below adds it, normalized to a
# path relative to ~/.pi/agent, so any clone location works on any machine.
for f in keybindings.json mcp.json models.json statusline.json pi-statusline.json APPEND_SYSTEM.md; do
  link "$REPO_DIR/config/$f" "$AGENT_DIR/$f"
done
copy "$REPO_DIR/config/settings.json" "$AGENT_DIR/settings.json"
link "$REPO_DIR/config/pi-permission-system.config.json" "$AGENT_DIR/extensions/pi-permission-system/config.json"
link "$REPO_DIR/config/subagent.config.json" "$AGENT_DIR/extensions/subagent/config.json"

# macOS junk-file filtering for pi's @ file search (pi shells out to fd)
link "$REPO_DIR/config/fd-ignore" "$HOME/.config/fd/ignore"

# git global ignore (same junk files)
git config --global core.excludesFile "$REPO_DIR/config/gitignore_global"
echo "git core.excludesFile -> $REPO_DIR/config/gitignore_global"

# Optional, macOS network drives: stop creating ._ files at the source
#   defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true   # then reboot

# Register this repo as a local pi package. This writes the repo path into
# ~/.pi/agent/settings.json, normalized relative to the agent dir, so the
# extension/theme resources resolve regardless of where the repo was cloned.
pi install "$REPO_DIR"

echo
echo "Done. Notes:"
echo "  - First 'pi' start auto-installs the npm packages from settings.json."
echo "  - Authenticate providers with /login (credentials are not in this repo)."
echo "  - settings.json is a copy, not a symlink: it holds machine-specific state"
echo "    (local package path). Re-run install.sh after updating the template."
