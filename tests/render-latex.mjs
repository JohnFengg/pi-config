import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = join(import.meta.dirname, "..");
const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const agentRoot = join(globalRoot, "@earendil-works/pi-coding-agent");
const tuiRoot = join(agentRoot, "node_modules/@earendil-works/pi-tui/dist");

const { transformLatexMarkdown } = await import(pathToFileURL(join(repoRoot, "extensions/lib/latex-markdown.ts")));
const { renderLatex } = await import(pathToFileURL(join(tuiRoot, "latex.js")));
const { Markdown } = await import(pathToFileURL(join(tuiRoot, "components/markdown.js")));

const isRenderable = (source, display) => {
	const rendered = renderLatex(source, { display });
	return rendered !== undefined && rendered.length > 0;
};

const theme = {
	heading: (t) => t,
	link: (t) => t,
	linkUrl: (t) => t,
	code: (t) => t,
	codeBlock: (t) => t,
	codeBlockBorder: (t) => t,
	quote: (t) => t,
	quoteBorder: (t) => t,
	hr: (t) => t,
	listBullet: (t) => t,
	bold: (t) => t,
	italic: (t) => `/${t}/`,
	strikethrough: (t) => t,
	underline: (t) => t,
};

function transform(markdown) {
	return transformLatexMarkdown(markdown, { isRenderable });
}

function render(markdown) {
	const md = new Markdown(transform(markdown), 0, 0, theme);
	return md
		.render(80)
		.map((line) => line.trimEnd())
		.join("\n")
		.trim();
}

const formula = String.raw`\sigma_H = q\, n_H\, \mu_{\mathrm{eff}},\quad`;
assert.equal(transform(formula), String.raw`$\sigma_H = q\, n_H\, \mu_{\mathrm{eff}},\quad$`);
assert.equal(render(formula), "σ_H = q n_H μ_eff,");

assert.equal(
	render(String.raw`电导率 \sigma_H = q\, n_H\, \mu_{\mathrm{eff}}，其中 n_H 是浓度。`),
	"电导率 σ_H = q n_H μ_eff，其中 n_H 是浓度。",
);

assert.equal(render(String.raw`already $\sigma_H$ delimited`), "already σ_H delimited");
assert.equal(render(String.raw`also \(\alpha + \beta\)`), "also α + β");
assert.equal(transform(String.raw`keep $\sigma_H$`), String.raw`keep $\sigma_H$`);

const latexFence = ["```latex", String.raw`\sigma_H = q\, n_H\, \mu_{\mathrm{eff}}`, "```"].join("\n");
assert.equal(transform(latexFence), ["$$", String.raw`\sigma_H = q\, n_H\, \mu_{\mathrm{eff}}`, "$$"].join("\n"));
assert.equal(render(latexFence), "σ_H = q n_H μ_eff");

assert.match(render("```ts\nconst sigma = 1;\n```"), /const sigma = 1;/);
assert.equal(transform("foo\n\n```latex\n\\alpha\n```\n\nbar"), "foo\n\n$$\n\\alpha\n$$\n\nbar");

assert.equal(render(String.raw`path C:\Users\foo and regex \d+ stay raw`), String.raw`path C:\Users\foo and regex \d+ stay raw`);
assert.equal(render("inline `\\sigma_H` stays code"), "inline \\sigma_H stays code");
assert.equal(render(String.raw`E = mc^2 is prose`), "E = mc^2 is prose");

assert.equal(transform(String.raw`- \mu_{\mathrm{eff}} is mobility`), String.raw`- $\mu_{\mathrm{eff}}$ is mobility`);
assert.equal(transform(String.raw`1. \sigma_H = 1`), String.raw`1. $\sigma_H = 1$`);
assert.equal(transform(String.raw`\alpha - \beta`), String.raw`$\alpha - \beta$`);
assert.equal(transform(String.raw`\mu_{\mathrm{ef}`), String.raw`\mu_{\mathrm{ef}`);
assert.equal(transform(String.raw`\mu_{\mathrm{eff}}`), String.raw`$\mu_{\mathrm{eff}}$`);
assert.equal(transform(String.raw`\alpha + \beta and later \frac{1}{2}`), String.raw`$\alpha + \beta$ and later $\frac{1}{2}$`);

assert.equal(render(String.raw`\sin x + \cos x`), "sin x + cos x");
assert.equal(render(String.raw`where \sigma_H = q n_H`), "where σ_H = q n_H");

console.log("render latex: pass");
