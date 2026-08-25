import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

/**
 * tool-border: draw a box-drawing border around default tool execution output.
 *
 * Self-rendered tools (renderShell: "self", e.g. edit diff) provide their own
 * framing, so they are left untouched.
 *
 * This patch is applied at session_start so it wraps the final prototype stack
 * after other extensions (e.g. compact-tool-activity) have installed their own
 * ToolExecutionComponent patches. The live UI theme is used because deep-imported
 * theme modules are dead copies under bundled Pi builds.
 */

const PATCHED = Symbol.for("pi.tool-border.patched");

type ToolExecutionComponentLike = {
  hideComponent: boolean;
  expanded: boolean;
  toolName: string;
  hasRendererDefinition: () => boolean;
  getRenderShell: () => string;
};

type ThemeLike = {
  fg: (token: string, text: string) => string;
};

function borderChar(theme: ThemeLike, char: string): string {
  return theme.fg("dim", char);
}

function padLine(line: string, width: number): string {
  const lineWidth = visibleWidth(line);
  const padding = Math.max(0, width - lineWidth);
  return line + " ".repeat(padding);
}

function makeTopBorder(theme: ThemeLike, width: number, toolName: string): string {
  const contentWidth = Math.max(0, width - 2);
  const title = ` ${toolName} `;
  const titleWidth = visibleWidth(title);
  if (titleWidth >= contentWidth) {
    return borderChar(theme, "┌") + borderChar(theme, "─".repeat(contentWidth)) + borderChar(theme, "┐");
  }
  const side = Math.floor((contentWidth - titleWidth) / 2);
  const remainder = contentWidth - titleWidth - side * 2;
  return (
    borderChar(theme, "┌") +
    borderChar(theme, "─".repeat(side)) +
    theme.fg("dim", title) +
    borderChar(theme, "─".repeat(side + remainder)) +
    borderChar(theme, "┐")
  );
}

function makeBottomBorder(theme: ThemeLike, width: number): string {
  const contentWidth = Math.max(0, width - 2);
  return borderChar(theme, "└") + borderChar(theme, "─".repeat(contentWidth)) + borderChar(theme, "┘");
}

function addBorder(theme: ThemeLike, lines: string[], width: number, toolName: string): string[] {
  if (lines.length === 0) return lines;
  const contentWidth = Math.max(0, width - 2);
  const top = makeTopBorder(theme, width, toolName);
  const body = lines.map((line) => borderChar(theme, "│") + padLine(line, contentWidth) + borderChar(theme, "│"));
  const bottom = makeBottomBorder(theme, width);
  return [top, ...body, bottom];
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;

    const theme = ctx.ui.theme as ThemeLike;
    const proto = ToolExecutionComponent.prototype as any;
    if (proto[PATCHED]) return;
    proto[PATCHED] = true;

    const originalRender = proto.render.bind(proto);
    proto.render = function (this: ToolExecutionComponentLike, width: number): string[] {
      if (this.hideComponent) return [];

      // Self-rendered tools provide their own framing.
      if (this.hasRendererDefinition && this.getRenderShell() === "self") {
        return originalRender.call(this, width);
      }

      // Render the inner content two columns narrower so the border fits
      // within the requested width.
      const innerWidth = Math.max(1, width - 2);
      const lines = originalRender.call(this, innerWidth);
      if (lines.length === 0) return lines;

      // Drop the leading spacer that ToolExecutionComponent adds for vertical
      // spacing; the border itself provides visual separation.
      let bodyLines = lines;
      if (bodyLines[0] === "") {
        bodyLines = bodyLines.slice(1);
      }

      return addBorder(theme, bodyLines, width, this.toolName);
    };
  });
}
