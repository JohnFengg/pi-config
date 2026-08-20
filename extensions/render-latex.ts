import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderLatex } from "@earendil-works/pi-tui";
import { transformLatexMarkdown } from "./lib/latex-markdown.ts";

/**
 * Render undelimited TeX and latex/tex/math fences in the TUI.
 *
 * pi-tui already turns `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` into
 * Unicode. Models still emit raw commands such as `\sigma_H = q\, n_H`
 * or put the source in a `latex` fence; those stay visible as TeX.
 * This hook wraps the supported cases so the built-in renderer can
 * convert them. Display-only: session text sent to the model is unchanged.
 */
export default function (pi: ExtensionAPI) {
	pi.registerMarkdownTransformer((markdown) =>
		transformLatexMarkdown(markdown, {
			isRenderable: (source, display) => {
				const rendered = renderLatex(source, { display });
				return rendered !== undefined && rendered.length > 0;
			},
		}),
	);
}
