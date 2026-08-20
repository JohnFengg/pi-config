/**
 * Display-only rewrite so TUI Markdown can render TeX that models emit
 * without math delimiters. Delimited math is left to pi-tui's renderer.
 */

const MATH_FENCE_LANGS = new Set(["latex", "tex", "math"]);

const SPACING_COMMANDS = new Set([
	",",
	":",
	";",
	"!",
	" ",
	">",
	"enspace",
	"enskip",
	"medspace",
	"quad",
	"qquad",
	"thickspace",
	"thinspace",
	"negmedspace",
	"negthickspace",
	"negthinspace",
]);

/** Commands that justify treating a backslash run as math, not a path or regex. */
const SUBSTANTIVE_COMMANDS = new Set(
	`
	alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa
	varkappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi
	varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
	pm mp times div cdot ast star circ bullet oplus ominus otimes oslash odot
	cap cup land lor wedge vee setminus
	in notin ni subset supset subseteq supseteq
	le leq leqslant ge geq geqslant ne neq equiv approx sim simeq cong
	propto parallel perp mid ll gg prec succ
	forall exists nexists neg
	to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow
	implies iff mapsto longrightarrow longleftarrow
	partial nabla int iint iiint oint sum prod coprod infty emptyset varnothing
	angle therefore because ell hbar Im Re prime ldots dots cdots
	langle rangle vert lvert rvert Vert lVert rVert lbrace rbrace
	lfloor rfloor lceil rceil backslash
	mathrm mathbf mathit mathcal mathbb mathsf mathtt mathfrak mathscr mathnormal
	mathup text textbf textit textrm textsf texttt textnormal mbox
	frac dfrac tfrac sqrt boxed fbox binom
	left right middle operatorname
	hat bar vec tilde dot ddot check breve grave acute mathring
	overline underline widehat widetilde overrightarrow
	sin cos tan cot sec csc sinh cosh tanh log ln exp lim inf sup max min
	det dim deg gcd arg arcsin arccos arctan
	not
	`.trim().split(/\s+/),
);

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

export type LatexTransformOptions = {
	/** Return true when pi-tui can turn this TeX into Unicode. */
	isRenderable?: (source: string, display?: boolean) => boolean;
};

type Segment =
	| { type: "prose"; text: string }
	| { type: "fence"; text: string; lang: string; body: string };

export function transformLatexMarkdown(markdown: string, options: LatexTransformOptions = {}): string {
	return splitFences(markdown)
		.map((segment) => {
			if (segment.type === "fence") {
				return transformMathFence(segment, options.isRenderable) ?? segment.text;
			}
			return wrapUndelimitedLatex(segment.text, options.isRenderable);
		})
		.join("");
}

function transformMathFence(
	segment: Extract<Segment, { type: "fence" }>,
	isRenderable?: LatexTransformOptions["isRenderable"],
): string | undefined {
	if (!MATH_FENCE_LANGS.has(segment.lang)) return undefined;
	const body = segment.body.trim();
	if (!body) return undefined;
	if (isRenderable && !isRenderable(body, true)) return undefined;
	if (!isRenderable && !hasSubstantiveCommand(body)) return undefined;
	const trailing = segment.text.endsWith("\n") ? "\n" : "";
	return `$$\n${body}\n$$${trailing}`;
}

function splitFences(markdown: string): Segment[] {
	const lines = splitLines(markdown);
	const segments: Segment[] = [];
	let proseStart = 0;
	const flushProse = (end: number) => {
		if (end > proseStart) segments.push({ type: "prose", text: markdown.slice(proseStart, end) });
	};

	for (let i = 0; i < lines.length; i++) {
		const open = FENCE_OPEN.exec(lines[i].content);
		if (!open) continue;
		const marker = open[2] ?? "";
		const lang = (open[3] ?? "").trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
		const close = new RegExp(`^ {0,3}${escapeRegExp(marker[0] ?? "")}{${marker.length},}\\s*$`);
		let j = i + 1;
		let closed = false;
		for (; j < lines.length; j++) {
			if (close.test(lines[j]?.content ?? "")) {
				closed = true;
				break;
			}
		}
		if (!closed) break;
		flushProse(lines[i].start);
		segments.push({
			type: "fence",
			text: markdown.slice(lines[i].start, lines[j].end),
			lang,
			body: markdown.slice(lines[i].end, lines[j].start).replace(/\n$/, ""),
		});
		proseStart = lines[j].end;
		i = j;
	}
	flushProse(markdown.length);
	return segments;
}

function splitLines(markdown: string): Array<{ start: number; end: number; content: string }> {
	const lines: Array<{ start: number; end: number; content: string }> = [];
	let start = 0;
	for (let i = 0; i <= markdown.length; i++) {
		if (i === markdown.length || markdown[i] === "\n") {
			lines.push({ start, end: i === markdown.length ? i : i + 1, content: markdown.slice(start, i) });
			start = i + 1;
		}
	}
	return lines;
}

function wrapUndelimitedLatex(
	text: string,
	isRenderable?: LatexTransformOptions["isRenderable"],
): string {
	const out: string[] = [];
	let index = 0;
	while (index < text.length) {
		const protectedEnd = consumeProtected(text, index);
		if (protectedEnd !== undefined) {
			out.push(text.slice(index, protectedEnd));
			index = protectedEnd;
			continue;
		}
		const next = nextProtectedIndex(text, index);
		out.push(wrapFormulas(text.slice(index, next), isRenderable));
		index = next;
	}
	return out.join("");
}

function wrapFormulas(text: string, isRenderable?: LatexTransformOptions["isRenderable"]): string {
	const spans: Array<{ start: number; end: number }> = [];
	let index = 0;
	while (index < text.length) {
		if (text[index] !== "\\") {
			index++;
			continue;
		}
		const command = readCommandName(text, index);
		if (!command || !SUBSTANTIVE_COMMANDS.has(command)) {
			index++;
			continue;
		}
		if (isInsideUnclosedGroup(text, index)) {
			index++;
			continue;
		}
		const commandEnd = consumeCommandForward(text, index);
		if (commandEnd === undefined) {
			index++;
			continue;
		}
		const start = expandLeft(text, index);
		const end = expandRight(text, commandEnd);
		const source = text.slice(start, end).trim();
		const ok = isRenderable ? isRenderable(source) : hasSubstantiveCommand(source);
		if (!ok || source.length === 0) {
			index = commandEnd;
			continue;
		}
		const trimmedStart = start + (text.slice(start, end).length - text.slice(start, end).trimStart().length);
		const trimmedEnd = trimmedStart + source.length;
		const previous = spans[spans.length - 1];
		if (previous && trimmedStart < previous.end) {
			previous.end = Math.max(previous.end, trimmedEnd);
		} else {
			spans.push({ start: trimmedStart, end: trimmedEnd });
		}
		index = trimmedEnd;
	}

	if (spans.length === 0) return text;
	let result = "";
	let cursor = 0;
	for (const span of spans) {
		result += text.slice(cursor, span.start);
		result += `$${text.slice(span.start, span.end)}$`;
		cursor = span.end;
	}
	return result + text.slice(cursor);
}

function expandRight(text: string, index: number): number {
	let position = index;
	while (position < text.length) {
		const afterSpace = skipHorizontalSpace(text, position);
		if (afterSpace === position && text[position] === "\n") break;
		const next = consumeAtomForward(text, afterSpace);
		if (next === undefined) {
			if (afterSpace > position && looksLikeTrailingMathPunct(text, afterSpace)) {
				return consumeTrailingPunct(text, afterSpace);
			}
			break;
		}
		position = next;
	}
	return position;
}

function expandLeft(text: string, index: number): number {
	let position = index;
	while (position > 0) {
		const afterSpace = skipHorizontalSpaceLeft(text, position);
		if (afterSpace === position && text[position - 1] === "\n") break;
		if (isMarkdownPrefix(text, afterSpace)) break;
		const prev = consumeAtomBackward(text, afterSpace);
		if (prev === undefined) break;
		position = prev;
	}
	return position;
}

function consumeAtomForward(text: string, index: number): number | undefined {
	if (index >= text.length) return undefined;
	if (text[index] === "\\") {
		const command = readCommandName(text, index);
		if (command === undefined) return undefined;
		if (!SUBSTANTIVE_COMMANDS.has(command) && !SPACING_COMMANDS.has(command)) return undefined;
		return consumeCommandForward(text, index);
	}
	if (isOperator(text[index])) return index + 1;
	if (text[index] === "(" || text[index] === ")" || text[index] === "[" || text[index] === "]") {
		return index + 1;
	}
	if (text[index] === "," || text[index] === ".") {
		const next = skipHorizontalSpace(text, index + 1);
		return consumeAtomForward(text, next) === undefined ? undefined : index + 1;
	}
	const number = consumeNumberForward(text, index);
	if (number !== undefined) return number;
	return consumeIdentForward(text, index);
}

function consumeAtomBackward(text: string, index: number): number | undefined {
	if (index <= 0) return undefined;
	const char = text[index - 1];
	if (isOperator(char) || char === "(" || char === ")" || char === "[" || char === "]") {
		return index - 1;
	}
	if (char === "," || char === ".") {
		const prev = skipHorizontalSpaceLeft(text, index - 1);
		return consumeAtomBackward(text, prev) === undefined ? undefined : index - 1;
	}
	const number = consumeNumberBackward(text, index);
	if (number !== undefined) return number;
	const ident = consumeIdentBackward(text, index);
	if (ident !== undefined) return ident;
	return consumeCommandBackward(text, index);
}

function consumeCommandForward(text: string, index: number): number | undefined {
	if (text[index] !== "\\") return undefined;
	let position = index + 1;
	if (position >= text.length) return undefined;
	if (/[A-Za-z]/.test(text[position] ?? "")) {
		while (position < text.length && /[A-Za-z]/.test(text[position] ?? "")) position++;
	} else if (SPACING_COMMANDS.has(text[position] ?? "")) {
		position++;
	} else {
		return undefined;
	}
	if (text[position] === "*") position++;
	while (text[position] === "[") {
		const close = matchBracket(text, position, "[", "]");
		if (close < 0) return undefined;
		position = close;
	}
	while (text[position] === "{") {
		const close = matchBracket(text, position, "{", "}");
		if (close < 0) return undefined;
		position = close;
	}
	return consumeScriptsForward(text, position);
}

function consumeCommandBackward(text: string, index: number): number | undefined {
	let position = consumeScriptsBackward(text, index);
	while (position > 0 && text[position - 1] === "}") {
		const open = matchBracketBackward(text, position, "{", "}");
		if (open < 0) return undefined;
		position = open;
	}
	while (position > 0 && text[position - 1] === "]") {
		const open = matchBracketBackward(text, position, "[", "]");
		if (open < 0) return undefined;
		position = open;
	}
	if (position > 0 && text[position - 1] === "*") position--;
	if (position <= 0) return undefined;
	if (SPACING_COMMANDS.has(text[position - 1] ?? "") && position >= 2 && text[position - 2] === "\\") {
		return position - 2;
	}
	if (!/[A-Za-z]/.test(text[position - 1] ?? "")) return undefined;
	while (position > 0 && /[A-Za-z]/.test(text[position - 1] ?? "")) position--;
	if (position === 0 || text[position - 1] !== "\\") return undefined;
	const name = readCommandName(text, position - 1);
	if (!name || (!SUBSTANTIVE_COMMANDS.has(name) && !SPACING_COMMANDS.has(name))) return undefined;
	return position - 1;
}

function consumeScriptsForward(text: string, index: number): number | undefined {
	let position = index;
	while (text[position] === "_" || text[position] === "^") {
		const next = position + 1;
		if (text[next] === "{") {
			const close = matchBracket(text, next, "{", "}");
			if (close < 0) return undefined;
			position = close;
		} else if (/[A-Za-z0-9]/.test(text[next] ?? "")) {
			position = next + 1;
		} else {
			return undefined;
		}
	}
	return position;
}

function consumeScriptsBackward(text: string, index: number): number {
	let position = index;
	while (position > 0) {
		if (text[position - 1] === "}") {
			const open = matchBracketBackward(text, position, "{", "}");
			if (open < 0) break;
			if (open > 0 && (text[open - 1] === "_" || text[open - 1] === "^")) {
				position = open - 1;
				continue;
			}
		}
		if (/[A-Za-z0-9]/.test(text[position - 1] ?? "") && position >= 2 && (text[position - 2] === "_" || text[position - 2] === "^")) {
			position -= 2;
			continue;
		}
		break;
	}
	return position;
}

function consumeIdentForward(text: string, index: number): number | undefined {
	if (!/[A-Za-z]/.test(text[index] ?? "")) return undefined;
	if (/[A-Za-z]/.test(text[index + 1] ?? "")) return undefined;
	let position = index + 1;
	while (/[0-9]/.test(text[position] ?? "")) position++;
	return consumeScriptsForward(text, position);
}

function consumeIdentBackward(text: string, index: number): number | undefined {
	const afterScripts = consumeScriptsBackward(text, index);
	let position = afterScripts;
	while (position > 0 && /[0-9]/.test(text[position - 1] ?? "")) position--;
	if (position === 0 || !/[A-Za-z]/.test(text[position - 1] ?? "")) return undefined;
	if (position >= 2 && /[A-Za-z]/.test(text[position - 2] ?? "")) return undefined;
	return position - 1;
}

function consumeNumberForward(text: string, index: number): number | undefined {
	if (!/[0-9]/.test(text[index] ?? "")) return undefined;
	let position = index;
	while (/[0-9]/.test(text[position] ?? "")) position++;
	if (text[position] === "." && /[0-9]/.test(text[position + 1] ?? "")) {
		position++;
		while (/[0-9]/.test(text[position] ?? "")) position++;
	}
	return consumeScriptsForward(text, position);
}

function consumeNumberBackward(text: string, index: number): number | undefined {
	const afterScripts = consumeScriptsBackward(text, index);
	let position = afterScripts;
	if (position === 0 || !/[0-9]/.test(text[position - 1] ?? "")) return undefined;
	while (position > 0 && /[0-9]/.test(text[position - 1] ?? "")) position--;
	if (position >= 2 && text[position - 1] === "." && /[0-9]/.test(text[position - 2] ?? "")) {
		position--;
		while (position > 0 && /[0-9]/.test(text[position - 1] ?? "")) position--;
	}
	return position;
}

function consumeProtected(text: string, index: number): number | undefined {
	if (text.startsWith("$$", index)) {
		const close = findUnescaped(text, "$$", index + 2);
		return close < 0 ? text.length : close + 2;
	}
	if (text[index] === "$" && text[index + 1] !== "$") {
		const close = findUnescaped(text, "$", index + 1);
		return close < 0 ? text.length : close + 1;
	}
	if (text.startsWith("\\(", index)) {
		const close = text.indexOf("\\)", index + 2);
		return close < 0 ? text.length : close + 2;
	}
	if (text.startsWith("\\[", index)) {
		const close = text.indexOf("\\]", index + 2);
		return close < 0 ? text.length : close + 2;
	}
	if (text[index] === "`") {
		let ticks = 1;
		while (text[index + ticks] === "`") ticks++;
		const close = text.indexOf("`".repeat(ticks), index + ticks);
		return close < 0 ? text.length : close + ticks;
	}
	return undefined;
}

function nextProtectedIndex(text: string, start: number): number {
	for (let i = start; i < text.length; i++) {
		if (consumeProtected(text, i) !== undefined) return i;
	}
	return text.length;
}

function readCommandName(text: string, index: number): string | undefined {
	if (text[index] !== "\\") return undefined;
	const next = text[index + 1];
	if (next === undefined) return undefined;
	if (/[A-Za-z]/.test(next)) {
		let end = index + 2;
		while (/[A-Za-z]/.test(text[end] ?? "")) end++;
		return text.slice(index + 1, end);
	}
	if (SPACING_COMMANDS.has(next)) return next;
	return undefined;
}

function isInsideUnclosedGroup(text: string, index: number): boolean {
	let depth = 0;
	for (let i = 0; i < index; i++) {
		if (text[i] === "\\") {
			i++;
			continue;
		}
		if (text[i] === "{") depth++;
		else if (text[i] === "}") depth = Math.max(0, depth - 1);
	}
	if (depth === 0) return false;
	for (let i = index; i < text.length && depth > 0; i++) {
		if (text[i] === "\\") {
			i++;
			continue;
		}
		if (text[i] === "{") depth++;
		else if (text[i] === "}") depth--;
	}
	return depth > 0;
}

function isMarkdownPrefix(text: string, index: number): boolean {
	const lineStart = text.lastIndexOf("\n", index - 1) + 1;
	const prefix = text.slice(lineStart, index);
	return /^\s*(?:[-*+]|\d+\.|>{1,6}|#{1,6})\s*$/.test(prefix);
}

function hasSubstantiveCommand(source: string): boolean {
	for (let i = 0; i < source.length; i++) {
		if (source[i] !== "\\") continue;
		const name = readCommandName(source, i);
		if (name && SUBSTANTIVE_COMMANDS.has(name)) return true;
	}
	return false;
}

function matchBracket(text: string, start: number, open: string, close: string): number {
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		if (text[i] === "\\") {
			i++;
			continue;
		}
		if (text[i] === open) depth++;
		else if (text[i] === close) {
			depth--;
			if (depth === 0) return i + 1;
		}
	}
	return -1;
}

function matchBracketBackward(text: string, end: number, open: string, close: string): number {
	let depth = 0;
	for (let i = end - 1; i >= 0; i--) {
		if (i > 0 && text[i - 1] === "\\") {
			i--;
			continue;
		}
		if (text[i] === close) depth++;
		else if (text[i] === open) {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function findUnescaped(text: string, needle: string, start: number): number {
	let index = text.indexOf(needle, start);
	while (index >= 0 && isEscaped(text, index)) {
		index = text.indexOf(needle, index + needle.length);
	}
	return index;
}

function isEscaped(text: string, index: number): boolean {
	let count = 0;
	for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) count++;
	return count % 2 === 1;
}

function skipHorizontalSpace(text: string, index: number): number {
	let position = index;
	while (text[position] === " " || text[position] === "\t") position++;
	return position;
}

function skipHorizontalSpaceLeft(text: string, index: number): number {
	let position = index;
	while (position > 0 && (text[position - 1] === " " || text[position - 1] === "\t")) position--;
	return position;
}

function isOperator(char: string | undefined): boolean {
	return char !== undefined && "=+-*/<>|".includes(char);
}

function looksLikeTrailingMathPunct(text: string, index: number): boolean {
	return text[index] === "," || text[index] === ".";
}

function consumeTrailingPunct(text: string, index: number): number {
	let position = index;
	if (text[position] === "," || text[position] === ".") position++;
	return skipHorizontalSpace(text, position);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
