import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

/**
 * Assistant text gutter with hanging indent.
 *
 * compact-tool-activity.ts renders tool rows as " ◆ Run …" (icon at
 * column 1, text at column 3). This extension gives assistant prose the
 * same geometry by patching Markdown.render for assistant-message
 * components (flagged by restore-assistant-transformers.ts via
 * options.__assistantGutter):
 *
 *   column 0   → Markdown paddingX (outputPad = 1)
 *   column 1   → "▶" on the first content line, two spaces afterwards
 *   column 3 + → message text — the same column as tool-row text
 *
 * Working at the render layer (instead of rewriting the Markdown source)
 * means lines produced by the component's own soft-wrap also get the
 * continuation indent, so wrapped paragraphs no longer protrude to
 * column 1. Every content line is indented uniformly, code blocks
 * included; blank lines are left untouched.
 *
 * Glyph note: U+25B6 measures width 1 in pi-tui's visibleWidth (same
 * East Asian Ambiguous class as the ◆ used by tool rows). If a terminal
 * ever renders it wide or blank, switch GUTTER_ICON to "❯" or ASCII ">".
 */
const GUTTER_ICON = "▶ ";
const GUTTER_CONTINUATION = "  ";
const GUTTER_WIDTH = 2;
const renderPatchMarker = Symbol.for("pi.assistant-gutter.render-patch");
/** Leading run of ANSI sequences and/or whitespace (the left margin). */
const LEADING_MARGIN = /^((?:\x1b\[[0-9;]*m|\x1b\][^\x07]*\x07|\s)+)/;

export default function (pi: ExtensionAPI) {
	const prototype = Markdown.prototype as any;
	if (prototype.render?.[renderPatchMarker]) return;

	const originalRender = prototype.render;
	const patchedRender = function (this: any, width: number): string[] {
		if (!this.options?.__assistantGutter) {
			return originalRender.call(this, width);
		}
		// Render narrower, then spend the two recovered columns on the gutter.
		const lines: string[] = originalRender.call(this, Math.max(1, width - GUTTER_WIDTH));
		let iconPlaced = false;
		return lines.map((line) => {
			if (line.trim() === "") return line;
			const gutter = iconPlaced ? GUTTER_CONTINUATION : GUTTER_ICON;
			iconPlaced = true;
			const margin = LEADING_MARGIN.exec(line);
			if (!margin) return gutter + line;
			return margin[1] + gutter + line.slice(margin[1].length);
		});
	};
	patchedRender[renderPatchMarker] = true;
	prototype.render = patchedRender;
}
