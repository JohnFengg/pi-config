import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

const patchMarker = Symbol.for("pi.compact-code-blocks.render-token");

/** Renders fenced Markdown as a terminal code region without literal backticks. */
export default function (_pi: ExtensionAPI) {
  const prototype = Markdown.prototype as any;
  const currentRenderToken = prototype.renderToken as any;
  if (currentRenderToken?.[patchMarker]) return;

  const patchedRenderToken = function (
    this: any,
    token: any,
    width: number,
    nextTokenType?: string,
    styleContext?: unknown,
  ): string[] {
    if (token?.type !== "code") {
      return currentRenderToken.call(this, token, width, nextTokenType, styleContext);
    }

    const lines: string[] = [];
    const border = this.theme.codeBlockBorder("│ ");
    const codeText = String(token.text ?? "").replace(/\r?\n$/, "");
    if (token.lang) lines.push(this.theme.codeBlockBorder(`┌ ${token.lang}`));

    if (this.theme.highlightCode) {
      for (const highlightedLine of this.theme.highlightCode(codeText, token.lang)) {
        lines.push(`${border}${highlightedLine}`);
      }
    } else {
      for (const codeLine of codeText.split("\n")) {
        lines.push(`${border}${this.theme.codeBlock(codeLine)}`);
      }
    }

    lines.push(this.theme.codeBlockBorder("└"));
    return lines;
  };

  patchedRenderToken[patchMarker] = true;
  prototype.renderToken = patchedRenderToken;
}
