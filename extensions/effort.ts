import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
	Container,
	Key,
	matchesKey,
	Text,
	type AutocompleteItem,
} from "@earendil-works/pi-tui";

// /effort — pick the current model's thinking/effort level.
//
// Opens a left/right selector of only the levels this model actually supports
// (via thinkingLevelMap / reasoning), matching pi's own getSupportedThinkingLevels
// rules. Also accepts `/effort high` for a direct set.

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const ALL_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

const LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No reasoning",
	minimal: "Very brief reasoning (~1k tokens)",
	low: "Light reasoning (~2k tokens)",
	medium: "Moderate reasoning (~8k tokens)",
	high: "Deep reasoning (~16k tokens)",
	xhigh: "Extra-high reasoning (~32k tokens)",
	max: "Maximum reasoning",
};

/** Human / provider aliases → pi thinking levels. */
const LEVEL_ALIASES: Record<string, ThinkingLevel> = {
	xh: "xhigh",
	extra: "xhigh",
	"extra-high": "xhigh",
	extra_high: "xhigh",
	extrahigh: "xhigh",
	"extra high": "xhigh",
};

type ModelLike = {
	id?: string;
	name?: string;
	reasoning?: boolean;
	thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

/** Mirror of pi-ai getSupportedThinkingLevels — only expose levels the model allows. */
export function getAvailableLevels(model: ModelLike | undefined | null): ThinkingLevel[] {
	if (!model?.reasoning) return ["off"];
	return ALL_LEVELS.filter((level) => {
		const mapped = model.thinkingLevelMap?.[level];
		if (mapped === null) return false;
		// xhigh/max are opt-in: only show when the map has a non-null entry
		if (level === "xhigh" || level === "max") return mapped !== undefined;
		return true;
	});
}

function isThinkingLevel(value: string): value is ThinkingLevel {
	return (ALL_LEVELS as string[]).includes(value);
}

function modelLabel(model: ModelLike | undefined | null): string {
	return model?.name || model?.id || "no model";
}

export function parseLevelArg(args: string | undefined): ThinkingLevel | undefined {
	const raw = args?.trim().toLowerCase().replace(/\s+/g, " ");
	if (!raw) return undefined;
	if (isThinkingLevel(raw)) return raw;
	return LEVEL_ALIASES[raw];
}

function applyLevel(pi: ExtensionAPI, ctx: ExtensionContext, level: ThinkingLevel, available: ThinkingLevel[]) {
	if (!available.includes(level)) {
		ctx.ui.notify(
			`"${level}" is not available for ${modelLabel(ctx.model)}. Available: ${available.join(", ")}`,
			"warning",
		);
		return;
	}
	const previous = pi.getThinkingLevel();
	pi.setThinkingLevel(level);
	const effective = pi.getThinkingLevel();
	if (effective === previous) {
		ctx.ui.notify(`Effort already ${effective}`, "info");
		return;
	}
	ctx.ui.notify(`Effort: ${effective}`, "info");
}

export default function effortExtension(pi: ExtensionAPI) {
	pi.registerCommand("effort", {
		description: "Select thinking/effort level for the current model (← →)",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const p = prefix.trim().toLowerCase().replace(/\s+/g, " ");
			const seen = new Set<ThinkingLevel>();
			const items: AutocompleteItem[] = [];
			const add = (level: ThinkingLevel) => {
				if (seen.has(level)) return;
				seen.add(level);
				items.push({
					value: level,
					label: level,
					description: LEVEL_DESCRIPTIONS[level],
				});
			};
			for (const level of ALL_LEVELS) {
				if (!p || level.startsWith(p)) add(level);
			}
			const aliased = parseLevelArg(p);
			if (aliased) add(aliased);
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const available = getAvailableLevels(ctx.model as ModelLike | undefined);
			const direct = parseLevelArg(args);

			if (args?.trim() && !direct) {
				ctx.ui.notify(
					`Unknown effort level "${args.trim()}". Try: ${available.join(", ")}`,
					"warning",
				);
				return;
			}

			if (direct) {
				applyLevel(pi, ctx, direct, available);
				return;
			}

			if (ctx.mode !== "tui") {
				// Headless / rpc: just report current + available
				ctx.ui.notify(
					`Effort: ${pi.getThinkingLevel()} (available: ${available.join(", ")})`,
					"info",
				);
				return;
			}

			if (!ctx.model?.reasoning) {
				ctx.ui.notify("Current model does not support thinking/effort", "warning");
				return;
			}

			const current = pi.getThinkingLevel() as ThinkingLevel;
			const initialIndex = Math.max(0, available.indexOf(available.includes(current) ? current : available[0]!));

			const selected = await ctx.ui.custom<ThinkingLevel | null>((tui, theme, _kb, done) => {
				let index = initialIndex;

				const container = new Container();
				const border = (str: string) => theme.fg("accent", str);
				container.addChild(new DynamicBorder(border));

				const title = new Text("");
				const track = new Text("");
				const description = new Text("");
				const hint = new Text("");
				container.addChild(title);
				container.addChild(new Text(""));
				container.addChild(track);
				container.addChild(new Text(""));
				container.addChild(description);
				container.addChild(hint);
				container.addChild(new DynamicBorder(border));

				const paint = () => {
					const level = available[index]!;
					const label = modelLabel(ctx.model as ModelLike | undefined);
					title.setText(
						theme.fg("accent", theme.bold("Effort")) +
							theme.fg("dim", ` · ${label} · now ${pi.getThinkingLevel()}`),
					);

					// Horizontal selector: off · low · [high] · max
					const parts = available.map((item, i) => {
						if (i === index) {
							return theme.fg("accent", theme.bold(`[${item}]`));
						}
						return theme.fg("muted", item);
					});
					const joined = parts.join(theme.fg("dim", " · "));
					track.setText(`  ${joined}`);

					description.setText(theme.fg("dim", `  ${LEVEL_DESCRIPTIONS[level]}`));
					hint.setText(theme.fg("dim", "  ← → change · enter confirm · esc cancel"));
				};

				paint();

				return {
					render(width: number) {
						return container.render(width);
					},
					invalidate() {
						container.invalidate();
					},
					handleInput(data: string) {
						if (matchesKey(data, Key.left) || data === "h" || data === "H") {
							index = (index - 1 + available.length) % available.length;
							paint();
							tui.requestRender();
							return;
						}
						if (matchesKey(data, Key.right) || data === "l" || data === "L") {
							index = (index + 1) % available.length;
							paint();
							tui.requestRender();
							return;
						}
						if (matchesKey(data, Key.enter)) {
							done(available[index]!);
							return;
						}
						if (matchesKey(data, Key.escape)) {
							done(null);
							return;
						}
						// Also accept digit shortcuts 1..n for quick jump
						const digit = data.length === 1 ? data.charCodeAt(0) - 48 : -1;
						if (digit >= 1 && digit <= available.length) {
							index = digit - 1;
							paint();
							tui.requestRender();
						}
					},
				};
			});

			if (!selected) return;
			applyLevel(pi, ctx, selected, available);
		},
	});
}
