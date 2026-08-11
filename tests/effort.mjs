import assert from "node:assert/strict";
import { join } from "node:path";
import { createJiti } from "/Users/toussaint/.nvm/versions/node/v24.14.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";

const agentRoot = "/Users/toussaint/.nvm/versions/node/v24.14.1/lib/node_modules/@earendil-works/pi-coding-agent";
const jiti = createJiti(import.meta.url, {
	moduleCache: false,
	alias: {
		"@earendil-works/pi-coding-agent": join(agentRoot, "dist/index.js"),
		"@earendil-works/pi-tui": join(agentRoot, "node_modules/@earendil-works/pi-tui/dist/index.js"),
	},
});

const repoRoot = new URL("..", import.meta.url).pathname;
const mod = await jiti.import(join(repoRoot, "extensions/effort.ts"));
const { getAvailableLevels } = mod;
const extension = mod.default;

// --- level filtering ---
assert.deepEqual(getAvailableLevels(undefined), ["off"]);
assert.deepEqual(getAvailableLevels({ reasoning: false }), ["off"]);

// Default reasoning model: base levels, no xhigh/max unless mapped
assert.deepEqual(getAvailableLevels({ reasoning: true }), [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
]);

// Kimi-style: holes + max opt-in
assert.deepEqual(
	getAvailableLevels({
		reasoning: true,
		thinkingLevelMap: {
			minimal: null,
			medium: null,
			xhigh: null,
			max: "max",
		},
	}),
	["off", "low", "high", "max"],
);

// Grok-style: low/medium/high only, no max
assert.deepEqual(
	getAvailableLevels({
		reasoning: true,
		thinkingLevelMap: {
			minimal: null,
			xhigh: null,
			// max intentionally omitted
		},
	}),
	["off", "low", "medium", "high"],
);

// Explicit null on a base level hides it; undefined keeps it
assert.deepEqual(
	getAvailableLevels({
		reasoning: true,
		thinkingLevelMap: { low: null },
	}),
	["off", "minimal", "medium", "high"],
);

// --- command registration ---
const commands = new Map();
extension({
	registerCommand(name, options) {
		commands.set(name, options);
	},
	getThinkingLevel() {
		return "high";
	},
	setThinkingLevel() {},
});
assert.ok(commands.has("effort"));
assert.match(commands.get("effort").description, /effort|thinking/i);

const completions = commands.get("effort").getArgumentCompletions("hi");
assert.deepEqual(
	completions.map((c) => c.value),
	["high"],
);

// Direct set path
let setTo;
const notices = [];
await commands.get("effort").handler("max", {
	mode: "tui",
	model: {
		id: "kimi-k3",
		reasoning: true,
		thinkingLevelMap: { minimal: null, medium: null, max: "max" },
	},
	ui: {
		notify(msg, level) {
			notices.push({ msg, level });
		},
	},
});
// Re-register with capturing setThinkingLevel
const commands2 = new Map();
extension({
	registerCommand(name, options) {
		commands2.set(name, options);
	},
	getThinkingLevel() {
		return "high";
	},
	setThinkingLevel(level) {
		setTo = level;
	},
});
await commands2.get("effort").handler("max", {
	mode: "tui",
	model: {
		id: "kimi-k3",
		reasoning: true,
		thinkingLevelMap: { minimal: null, medium: null, max: "max" },
	},
	ui: {
		notify() {},
	},
});
assert.equal(setTo, "max");

// Reject unsupported level for model
const warns = [];
await commands2.get("effort").handler("minimal", {
	mode: "tui",
	model: {
		id: "kimi-k3",
		reasoning: true,
		thinkingLevelMap: { minimal: null, medium: null, max: "max" },
	},
	ui: {
		notify(msg, level) {
			warns.push({ msg, level });
		},
	},
});
assert.equal(warns.at(-1)?.level, "warning");
assert.match(warns.at(-1)?.msg ?? "", /not available/);

// Non-reasoning model without args
const nonReason = [];
await commands2.get("effort").handler("", {
	mode: "tui",
	model: { id: "gpt-4o", reasoning: false },
	ui: {
		notify(msg, level) {
			nonReason.push({ msg, level });
		},
	},
});
assert.equal(nonReason.at(-1)?.level, "warning");
assert.match(nonReason.at(-1)?.msg ?? "", /does not support/);

console.log("effort extension regression: pass");
