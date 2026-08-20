# Offline Install Bundle

For machines with **no network access** — pi cannot download the npm
extensions there, so this folder provides a self-contained bundle.

## Workflow

**On the online machine** (where everything is installed):

```bash
./offline/build-offline.sh
```

Produces `offline/pi-config-offline-<version>.tar.gz` (~95 MB) containing:

1. `pi-config/` — full repo source (extensions/, themes/, config/, install.sh)
2. `npm/` — snapshot of `~/.pi/agent/npm` (package.json + lock + node_modules,
   all 12 extension packages with their dependencies)

Copy that **single file** to the offline machine (USB drive, etc.).

**On the offline machine** (official pi already installed):

```bash
tar xzf pi-config-offline-<version>.tar.gz
cd pi-config-offline-<version>/pi-config
./offline/install-offline.sh
```

What the installer does:

1. Restores the npm snapshot to `~/.pi/agent/npm` (backs up any existing dir)
2. Runs the normal `install.sh` (links configs, registers this repo as a local
   pi package so extensions/ + themes/ load from it)
3. Advises `export PI_OFFLINE=1` so pi never attempts network installs

Then `pi` starts fully offline: all 12 extensions resolve from the local npm
snapshot, `gruvbox-dark` theme and all custom extensions load from the
pi-config package. Authenticate providers with `/login`.

## Notes

- The bundle is **not committed to git** (95 MB, over GitHub's file limit);
  build it fresh on the online machine whenever you update pi-config or the
  extensions.
- The npm snapshot is architecture-independent for the extensions in use
  (esbuild ships all platform binaries as optionalDependencies).
- Version skew: if the offline machine has an older/newer official pi, the
  extension snapshot is still self-contained (pi loads what is present and
  version-satisfying).
