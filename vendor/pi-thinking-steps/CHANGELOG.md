# Changelog

## 1.0.11-fork.1 - 2026-08-25

### Fixed

- Restored thinking-step rendering on Pi ≥ 0.84.3 (bundled `dist/bundle/cli.js` entry). The patch now resolves the live `AssistantMessageComponent` through the package's public entry point, which Pi's extension loader maps to the running Pi in both alias and virtualModules modes, instead of deriving `dist/...` file paths from `import.meta.resolve` — that legacy path silently resolved to this package's own pinned 0.69.0 dependency under bundled Pi, patching a dead class while the TUI kept rendering natively. The live UI theme (`ctx.ui.theme`) is now handed to the patch from `session_start`, avoiding the dead deep-imported theme module under bundled builds.

## 1.0.11 - 2026-05-12

### Fixed

- Made final patch cleanup retryable across same-scope session-shutdown retries and cleared stale message ownership on shutdown before later session reuse.
- Preserved heading scope across intro-plus-list sections, split bare imperative post-list prose, demoted uncertain safer-plan wording ahead of decision/plan-change classification, narrowed reference-only issue/problem/warning error-role false positives, and stripped non-CSI ESC control residue from rendered thinking text.

### Changed

- Published `tsconfig.json` plus the advertised validation tests in the npm package, refreshed the README release metadata, and updated the audit prompts and project instructions to reflect the current release surface.
- Marked the local `plan.md` planning artifact as historical/non-authoritative and marked the archived v1 audit prompt as superseded by the canonical v2 prompt.

### Tests

- Added regressions for cleanup retryability, shutdown message rebinds, parser boundary cases, non-CSI ESC sanitization, package metadata contracts, and semantic summarizer assertions.
## 1.0.10 - 2026-05-11

### Fixed

- Isolated thinking patch release ownership and active thinking state across concurrent session scopes.
- Preserved message ownership through patched rendering, including reused message objects and duplicate timestamps.
- Hardened parser/summarizer handling for list continuations, failure vocabulary, plan-change wording, and visible summary metadata.
- Stripped ST-terminated terminal control payloads from rendered thinking text.

### Changed

- Clarified compatibility and workflow documentation for scope-owned cleanup, degraded sessions, tracked changelog handling, and local planning artifacts.
- Centralized persisted preference scope typing in shared contracts.

### Tests

- Added regressions covering scoped patch lifecycle, parser/summarizer edge cases, terminal control sanitization, package metadata contracts, and docs/workflow drift.

## 1.0.9 - 2026-05-06

### Fixed

- Prevented CPU saturation during long thinking streams by bounding baseline summarizer candidate scoring to a salient retained subset instead of processing an unbounded candidate list.
- Reduced hot-path allocation in summary similarity scoring by caching token sets per candidate and reusing them during comparisons.
- Preserved summary fidelity for late high-signal failure candidates while limiting generic candidate volume.

### Tests

- Added regressions for small-input failure summary preservation and late salient failure retention after large generic candidate sets.
