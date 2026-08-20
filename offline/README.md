# Offline Install Bundle

For machines with **no network access** — pi cannot download the npm
extensions there, so this folder provides a self-contained bundle.

## Workflow

**On the online machine** (where everything is installed):

```bash
./offline/build-offline.sh
```

Produces `offline/pi-config-offline-<version>.tar.gz` (~112 MB) containing:

1. `pi-config/` — full repo source (extensions/, themes/, config/, install.sh)
2. `npm/` — snapshot of `~/.pi/agent/npm` (package.json + lock + node_modules,
   all 12 extension packages with their dependencies)
3. `bin/linux/` — fd 10.4.2 + ripgrep 15.2.0 binaries for x86_64 and aarch64

Copy that **single file** to the offline machine (USB drive, etc.).

**On the offline machine** (official pi already installed):

```bash
tar xzf pi-config-offline-<version>.tar.gz
cd pi-config-offline-<version>/pi-config
./offline/install-offline.sh
```

What the installer does:

1. Restores the npm snapshot to `~/.pi/agent/npm` (backs up any existing dir)
2. Installs the matching-architecture fd/ripgrep binaries into
   `~/.pi/agent/bin/` — pi checks this dir first, so `@` file autocomplete
   (fd) and grep (rg) work offline without the GitHub download
3. Runs the normal `install.sh` (links configs, registers this repo as a local
   pi package so extensions/ + themes/ load from it)
4. Advises `export PI_OFFLINE=1` so pi never attempts network installs

Then `pi` starts fully offline: all 12 extensions resolve from the local npm
snapshot, `gruvbox-dark` theme and all custom extensions load from the
pi-config package. Authenticate providers with `/login`.

## Notes

- The bundle is **not committed to git** (~112 MB, over GitHub's file limit);
  build it fresh on the online machine whenever you update pi-config or the
  extensions.
- The npm snapshot is architecture-independent for the extensions in use
  (esbuild ships all platform binaries as optionalDependencies).
- Version skew: if the offline machine has an older/newer official pi, the
  extension snapshot is still self-contained (pi loads what is present and
  version-satisfying).
- Why fd/rg are bundled: pi's `ensureTool()` checks `~/.pi/agent/bin/`, then
  PATH (`fd`/`fdfind`, `rg`), then downloads from GitHub — the last step is
  skipped under `PI_OFFLINE=1`, so without the bundled binaries `@` autocomplete
  (fd) and grep (rg) silently degrade. Ubuntu's apt package for fd is named
  `fd-find` (binary `fdfind`), which pi also accepts if you prefer apt.
  Bundled versions: fd 10.4.2 (needs GLIBC ≥ 2.9, fine on Ubuntu 24.04),
  ripgrep 15.2.0 (static musl build, zero deps).
