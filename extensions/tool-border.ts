import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";

/**
 * tool-border: draw a box-drawing border around default tool execution output.
 *
 * Self-rendered tools (renderShell: "self", e.g. edit diff) provide their own
 * framing, so they are left untouched.
 *
 * This patch is applied at session_start so it wraps the final prototype stack
 * after other extensions (e.g. compact-tool-activity) have installed their own
 * ToolExecutionComponent patches.
 */

const PATCHED = Symbol.for("pi.tool-border.patched");

type ToolExecutionComponentLike = {
  hideComponent: boolean;
  expanded: boolean;
  toolName: string;
  hasRendererDefinition: () => boolean;
  getRenderShell: () => string;
};

function borderChar(char: string): string {
  return theme.fg("dim", char);
}

function padLine(line: string, width: number): string {
  const lineWidth = visibleWidth(line);
  const padding = Math.max(0, width - lineWidth);
  return line + " ".repeat(padding);
}

function makeTopBorder(width: number, toolName: string): string {
  const contentWidth = Math.max(0, width - 2);
  const title = ` ${toolName} `;
  const titleWidth = visibleWidth(title);
  if (titleWidth >= contentWidth) {
    return borderChar("┌") + borderChar("─".repeat(contentWidth)) + borderChar("┐");
  }
  const side = Math.floor((contentWidth - titleWidth) / 2);
  const remainder = contentWidth - titleWidth - side * 2;
  return (
    borderChar("┌") +
    borderChar("─".repeat(side)) +
    theme.fg("dim", title) +
    borderChar("─".repeat(side + remainder)) +
    borderChar("┐")
  );
}

function makeBottomBorder(width: number): string {
  const contentWidth = Math.max(0, width - 2);
  return borderChar("└") + borderChar("─".repeat(contentWidth)) + borderChar("┘");
}

function addBorder(lines: string[], width: number, toolName: string): string[] {
  if (lines.length === 0) return lines;
  const contentWidth = Math.max(0, width - 2);
  const top = makeTopBorder(width, toolName);
  const body = lines.map((line) => borderChar("│") + padLine(line, contentWidth) + borderChar("│"));
  const bottom = makeBottomBorder(width);
  return [top, ...body, bottom];
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;

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

      return addBorder(bodyLines, width, this.toolName);
    };
  });
}
