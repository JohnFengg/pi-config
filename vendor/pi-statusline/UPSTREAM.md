# pi-statusline (vendored)

Upstream: `@smarzban/pi-statusline` v0.2.1 (npm) — MIT.
Repo: https://github.com/smarzban/pi-extensions (directory `packages/pi-statusline`).
Vendored from the npm tarball because the footer replaces pi's built-in one
entirely and needs one small local patch to stay compatible with
pi-bg-tasks status output.

## Why vendored

This extension renders a fully custom footer (`ctx.ui.setFooter`), which
replaces pi's built-in footer — including the extension-status area fed by
`ctx.ui.setStatus()`. The vendored pi-bg-tasks puts its running-task pill
into `setStatus("bg-tasks", …)`, so with the stock npm build of this
extension that information was silently invisible in the statusline.

## Local patches

1. **`index.ts` — render extension statuses.** `renderFooterLines` now
   appends every text from `footerData.getExtensionStatuses()` as a bracketed
   trailing segment. Without any extension setting a status, the footer is
   byte-identical to upstream.

## Updating from upstream

```sh
npm view @smarzban/pi-statusline version
cp ~/.pi/agent/npm/node_modules/@smarzban/pi-statusline/{index.ts,pr-link.mjs,pr-link.d.mts} vendor/pi-statusline/
# re-apply the patch in renderFooterLines (search for LOCAL PATCH)
```

Keep `LICENSE`, `README.md`, `package.json`, and this file when refreshing.
The extension reads its persisted state from `<agentDir>/statusline.json`,
so vendoring does not affect config resolution.
