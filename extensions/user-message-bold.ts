import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Bold user messages.
 *
 * Pi theme tokens are color-only (userMessageBg / userMessageText), so
 * boldness is added here at the display layer by wrapping lines in Markdown
 * strong markers. List/quote/heading markers stay outside the wrap so the
 * structure survives; fenced code blocks and table rows are left untouched
 * (strong markers would break their rendering). Display-only: the message
 * stored in the session and sent to the model is unchanged.
 */
const FENCE = /^\s*(```|~~~)/;
const BLOCK_MARKER = /^(\s*(?:[-*+]|\d+\.|>+|#{1,6})\s+)(\S.*)$/;
const TABLE_ROW = /^\s*\|/;

export default function (pi: ExtensionAPI) {
	pi.registerMarkdownTransformer((markdown, { messageType }) => {
		if (messageType !== "user") return markdown;
		let inFence = false;
		return markdown
			.split("\n")
			.map((line) => {
				if (FENCE.test(line)) {
					inFence = !inFence;
					return line;
				}
				if (inFence || line.trim() === "" || TABLE_ROW.test(line)) return line;
				// Strip pre-existing emphasis markers so the wrap can't nest badly.
				const plain = line.replaceAll("**", "").replaceAll("__", "");
				const marker = BLOCK_MARKER.exec(plain);
				if (marker) return `${marker[1]}**${marker[2]}**`;
				return `**${plain}**`;
			})
			.join("\n");
	});
}
