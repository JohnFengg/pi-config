import { AssistantMessageComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Restore markdown transformers for assistant messages.
 *
 * pi-thinking-steps replaces AssistantMessageComponent.updateContent with its
 * own implementation (to render "Thinking Steps" summaries), but its version
 * constructs Markdown children WITHOUT the options.transform hook. That
 * silently drops every registered markdown transformer — mermaid diagrams and
 * display transformers like assistant-gutter.ts — for assistant text.
 *
 * This extension wraps updateContent (re-asserting after third-party renderer
 * patches install, which happens async at session_start) and re-attaches the
 * component's own markdownTransformers to any Markdown child that lost its
 * transform. Children that already carry a transform (stock Pi rendering)
 * are left untouched.
 */
const patchMarker = Symbol.for("pi.restore-assistant-transformers.wrapper");

type TransformerContext = { messageType: string; isStreaming: boolean; availableWidth: number };
type MarkdownTransformer = (markdown: string, context: TransformerContext) => string;

/** Same chaining semantics as pi's applyMarkdownTransformers. */
function buildTransform(isStreaming: boolean, transformers: MarkdownTransformer[]) {
	return (markdown: string, availableWidth: number): string => {
		let transformed = markdown;
		for (const transformer of transformers) {
			try {
				const result = transformer(transformed, { messageType: "assistant", isStreaming, availableWidth });
				if (typeof result === "string") transformed = result;
			} catch {
				// Keep the current Markdown and continue with the next transformer.
			}
		}
		return transformed;
	};
}

/** Duck-typed Markdown check — safe across duplicate pi-tui module instances. */
function isMarkdownChild(child: unknown): child is { options: Record<string, unknown>; defaultTextStyle?: unknown } {
	return (
		typeof child === "object" &&
		child !== null &&
		(child as { constructor?: { name?: string } }).constructor?.name === "Markdown" &&
		typeof (child as { options?: unknown }).options === "object" &&
		(child as { options?: unknown }).options !== null
	);
}

export default function (pi: ExtensionAPI) {
	const install = () => {
		const prototype = AssistantMessageComponent.prototype as any;
		const current = prototype.updateContent;
		if (typeof current !== "function" || current[patchMarker]) return;

		const wrapped = function (this: any, message: unknown, ...rest: unknown[]) {
			current.call(this, message, ...rest);

			const transformers: MarkdownTransformer[] = Array.isArray(this.markdownTransformers) ? this.markdownTransformers : [];
			const isStreaming = typeof rest[0] === "boolean" ? rest[0] : Boolean(this.isStreaming);
			for (const child of this.contentContainer?.children ?? []) {
				if (!isMarkdownChild(child)) continue;
				if (child.defaultTextStyle !== undefined) continue; // thinking blocks: no gutter
				if (transformers.length > 0 && child.options.transform === undefined) {
					child.options = { ...child.options, transform: buildTransform(isStreaming, transformers) };
				}
				if (child.options.__assistantGutter === undefined) {
					child.options = { ...child.options, __assistantGutter: true };
				}
			}
		};
		wrapped[patchMarker] = true;
		prototype.updateContent = wrapped;
	};

	install();
	// Third-party renderer patches install async at session_start; re-assert after them.
	pi.on("session_start", async () => {
		setTimeout(install, 0);
	});
	pi.on("message_start", async () => {
		install();
	});
}
