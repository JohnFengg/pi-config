# pi-bg-tasks (vendored)

Upstream: `pi-bg-tasks` v0.1.4 (npm), fork of pi-patty-bg-tasks — MIT.
Source repo: https://github.com/cyzlmh/pi-extensions (monorepo subdir `pi-bg-tasks`).
Vendored from the npm tarball (`~/.pi/agent/npm/node_modules/pi-bg-tasks`)
because upstream is a monorepo subdir (not subtree-friendly) and the copy
needs one small local patch.

## Why vendored

`compact-tool-activity` (this repo, `extensions/`) used to override the
built-in `bash` tool for compact rendering. pi's loader rejects two
extensions registering the same tool name, and pi-bg-tasks also overrides
`bash` (to add `run_in_background`), so the two could not be loaded together.

## Local patches

1. **`tools-bash.ts` — cooperative renderer hook.** The `bash` override now
   exposes its rendering to other extensions via
   `globalThis[Symbol.for("pi-bg-tasks.renderers")]`:
   - `renderShell` is a lazy getter: `"self"` when the hook is present,
     `"default"` otherwise.
   - `renderCall` / `renderResult` delegate to the hook when present and
     throw otherwise; pi's tool-execution wraps renderer calls in try/catch
     and falls back to native default rendering, so without the hook the
     behaviour is exactly stock pi-bg-tasks.
   - Everything resolves at render time, so factory load order between this
   - extension and the renderer provider does not matter.

   `extensions/compact-tool-activity.ts` in this repo registers the hook with
   its one-line compact renderers. Result: background execution +
   notifications from pi-bg-tasks, compact rows from compact-tool-activity.

## Updating from upstream

```sh
# inspect the new version first
npm view pi-bg-tasks version
# then refresh the copy (tests/ deliberately not vendored)
cp ~/.pi/agent/npm/node_modules/pi-bg-tasks/extensions/bg-tasks/*.ts vendor/pi-bg-tasks/
# re-apply the patch in tools-bash.ts (search for EXTERNAL_RENDERERS)
```

Keep `LICENSE` and this file when refreshing.
