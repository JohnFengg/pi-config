import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * rewind-theme-patch: make @ayulab/pi-rewind's checkpoint list follow the active
 * pi theme instead of hardcoded 256-color ANSI (38;5;245/2/1).
 *
 * The rewind package renders its checkpoint list through `ctx.ui.custom(...)`.
 * We wrap `ui.custom` once per session (the ui object is the runner-shared
 * uiContext, so one wrap covers every command) and remap the hardcoded SGR
 * codes to theme tokens on every rendered line:
 *
 *   \x1b[38;5;245m  gray   → dim
 *   \x1b[38;5;2m    green  → success
 *   \x1b[38;5;1m    red    → error
 *   \x1b[0m         reset  → foreground-only reset (keeps theme background)
 *
 * Only lines containing 256-color foreground codes are touched, so other
 * extensions' custom UIs (which use the theme directly) pass through untouched.
 */

const PATCHED = Symbol.for("pi.rewind-theme-patch.patched");

type ThemeLike = { fg: (token: string, text: string) => string };
type CustomFactory = (tui: unknown, theme: ThemeLike, keybindings: unknown, done: (value?: unknown) => void) => unknown;
type CustomOptions = { overlay?: boolean; overlayOptions?: unknown; onHandle?: (handle: unknown) => void };

function fgPrefix(theme: ThemeLike, token: string): string {
  return theme.fg(token, "").replace(/\x1b\[39m$/, "");
}

function remapAnsi(line: string, theme: ThemeLike): string {
  if (!line.includes("\x1b[38;5;")) return line;
  return line
    .replace(/\x1b\[38;5;245m/g, () => fgPrefix(theme, "dim"))
    .replace(/\x1b\[38;5;2m/g, () => fgPrefix(theme, "success"))
    .replace(/\x1b\[38;5;1m/g, () => fgPrefix(theme, "error"))
    .replace(/\x1b\[0m/g, "\x1b[39m");
}

function wrapRender(component: unknown, theme: ThemeLike): unknown {
  const candidate = component as { render?: (width: number) => string[] } | null | undefined;
  if (!candidate || typeof candidate.render !== "function") return component;
  const originalRender = candidate.render.bind(candidate);
  candidate.render = (width: number) => originalRender(width).map((line) => remapAnsi(line, theme));
  return component;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const ui = ctx.ui as unknown as {
      custom?: (factory: CustomFactory, options?: CustomOptions) => Promise<unknown>;
    } & Record<symbol, boolean>;
    if (!ui || typeof ui.custom !== "function" || ui[PATCHED]) return;
    ui[PATCHED] = true;

    const originalCustom = ui.custom.bind(ui);
    ui.custom = (factory, options) =>
      originalCustom((tui, theme, keybindings, done) => {
        const result = factory(tui, theme, keybindings, done);
        if (result && typeof (result as Promise<unknown>).then === "function") {
          return (result as Promise<unknown>).then((component) => wrapRender(component, theme));
        }
        return wrapRender(result, theme);
      }, options);
  });
}
