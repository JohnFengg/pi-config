import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, type AutocompleteItem } from "@earendil-works/pi-tui";

// Session-scoped permission presets.
//
// This extension never writes pi-permission-system's config.json. The global
// config is a static baseline ("*": "ask", read tools allowed, plus
// authorizerChain: ["session-preset"]) and each session's preset lives only
// in process memory. Enforcement happens through a live-authority chain link
// registered with pi-permission-system:
//
//   default  → defer every ask to the normal permission prompt
//   readonly → deny write/edit/bash tool calls, defer everything else
//   yolo     → auto-allow asks, except fail-closed bash floors (opaque/
//              indirection wrappers such as sudo, bash -c, eval, find -exec;
//              unparseable commands) defer, matching the old file-based preset
//   auto     → auto-allow every ask, shell wrappers included
//
// For yolo and auto, the chain's bounded-delegation envelope still caps an
// allow on external_directory/path (and on asks whose surface cannot be
// determined) to defer, so outside-project access keeps prompting. That
// floor is engine-enforced and cannot be lifted by a link.
//
// shift+tab / /permission-preset switch the preset for THIS session only;
// other running sessions (separate processes) are unaffected, and their
// widgets can no longer drift out of sync with reality.

type PresetName = "readonly" | "default" | "yolo" | "auto";

type Preset = {
	label: string;
	description: string;
};

const PRESETS: Record<PresetName, Preset> = {
	readonly: {
		label: "read-only",
		description: "Allow reads; deny write, edit, and bash; ask for other tools",
	},
	default: {
		label: "default",
		description: "Allow reads; ask before modifications, shell commands, and other tools",
	},
	yolo: {
		label: "yolo",
		description: "Auto-approve project ops; still ask for outside-project access and shell wrappers",
	},
	auto: {
		label: "auto",
		description: "Auto-approve everything (incl. sudo/eval wrappers); only outside-project access still asks",
	},
};

const CYCLE: PresetName[] = ["default", "readonly", "yolo", "auto"];
/** Preset every new session starts with. */
const STARTUP_PRESET: PresetName = "yolo";
/** Name referenced by authorizerChain in pi-permission-system's config.json. */
const AUTHORIZER_NAME = "session-preset";
const READONLY_DENY_REASON =
	"Read-only preset is active for this session (switch with shift+tab or /permission-preset).";
const READONLY_DENIED_TOOLS = new Set(["write", "edit", "bash"]);
/** Synthetic matched patterns from pi-permission-system's fail-closed bash floors. */
const BASH_FLOOR_PATTERN = /^<.*>$/;

// Process-global state via Symbol.for: one interactive session per process
// makes process-global equivalent to session-global, and a stale authorizer
// closure left in the registry by /reload still reads the live value.
const PRESET_KEY = Symbol.for("pi-permission-presets:current-preset");
const SERVICE_KEY = Symbol.for("@gotgenes/pi-permission-system:service");

type AuthorizerVerdict = { kind: "allow" } | { kind: "deny"; reason?: string } | { kind: "defer" };

interface AuthorizeDetails {
	toolName?: string;
	surface?: string | null;
	value?: string | null;
	command?: string;
}

interface PermissionQueryLike {
	checkPermission(surface: string, value?: string): { matchedPattern?: string };
}

interface PermissionsServiceLike {
	registerAuthorizer(
		name: string,
		authorize: (details: AuthorizeDetails, query: PermissionQueryLike) => AuthorizerVerdict | Promise<AuthorizerVerdict>,
	): () => void;
}

function getPreset(): PresetName {
	const value = (globalThis as Record<symbol, unknown>)[PRESET_KEY];
	return typeof value === "string" && value in PRESETS ? (value as PresetName) : STARTUP_PRESET;
}

function setPreset(name: PresetName): void {
	(globalThis as Record<symbol, unknown>)[PRESET_KEY] = name;
}

function getService(): PermissionsServiceLike | undefined {
	return (globalThis as Record<symbol, unknown>)[SERVICE_KEY] as PermissionsServiceLike | undefined;
}

function authorize(details: AuthorizeDetails, query: PermissionQueryLike): AuthorizerVerdict {
	const preset = getPreset();
	const name = details.toolName ?? details.surface ?? "";

	if (preset === "auto") {
		// Blanket auto-approve, shell wrappers included. The delegation envelope
		// still caps allows on external_directory/path (and surface-less asks) to
		// defer — outside-project access keeps prompting, by engine design.
		return { kind: "allow" };
	}

	if (preset === "yolo") {
		// Keep the fail-closed bash floors prompting, at parity with the old
		// file-based yolo preset: bash -c/eval/sudo/xargs/find -exec etc. are
		// clamped to ask by the gate and must not ride the auto-allow.
		if (name === "bash") {
			const command = details.command ?? details.value ?? undefined;
			if (command) {
				const result = query.checkPermission("bash", command);
				if (result.matchedPattern && BASH_FLOOR_PATTERN.test(result.matchedPattern)) {
					return { kind: "defer" };
				}
			}
		}
		return { kind: "allow" };
	}

	if (preset === "readonly" && READONLY_DENIED_TOOLS.has(name)) {
		return { kind: "deny", reason: READONLY_DENY_REASON };
	}

	return { kind: "defer" };
}

function syncPresetUi(ctx: Pick<ExtensionContext, "ui">): void {
	ctx.ui.setStatus("permission-preset", undefined);
	ctx.ui.setWidget(
		"permission-preset",
		(_tui, theme) => {
			const preset = getPreset();
			const label = PRESETS[preset].label;
			let text: string;
			if (preset === "yolo") {
				text = `${theme.bold(label)} ${theme.fg("warning", "⚠ auto-approving project ops; outside-project & shell wrappers still ask")}`;
			} else if (preset === "auto") {
				text = `${theme.bold(label)} ${theme.fg("error", "⚠ auto-approving ALL ops (sudo/rm incl.); only outside-project still asks")}`;
			} else {
				text = theme.bold(label);
			}
			return new Text(text, 0, 0);
		},
		{ placement: "belowEditor" },
	);
}

function completions(prefix: string): AutocompleteItem[] | null {
	const normalized = prefix.trim().toLowerCase();
	const items = CYCLE.filter((name) => name.startsWith(normalized)).map((name) => ({
		value: name,
		label: name,
		description: PRESETS[name].description,
	}));
	return items.length ? items : null;
}

export default function (pi: ExtensionAPI) {
	let linkRegistered = false;

	function registerLink(): void {
		if (linkRegistered) return;
		const service = getService();
		if (!service) return;
		try {
			service.registerAuthorizer(AUTHORIZER_NAME, authorize);
			linkRegistered = true;
		} catch (error) {
			// The registry can survive this extension's reload: the older link under
			// the same name still dispatches to authorize(), which reads the live
			// process-global preset, so enforcement stays correct.
			if (error instanceof Error && error.message.includes("already registered")) {
				linkRegistered = true;
				return;
			}
			throw error;
		}
	}

	function applyPreset(name: PresetName, ctx: Pick<ExtensionContext, "ui">): void {
		setPreset(name);
		syncPresetUi(ctx);
		ctx.ui.notify(
			`Permission preset: ${PRESETS[name].label} — ${PRESETS[name].description}`,
			name === "auto" || name === "yolo" ? "warning" : "info",
		);
		if (!linkRegistered) {
			registerLink();
			if (!linkRegistered) {
				ctx.ui.notify("pi-permission-system not detected; preset switch has no effect.", "warning");
			}
		}
	}

	pi.registerCommand("permission-preset", {
		description: "Switch this session's permission preset: default, readonly, yolo, or auto",
		getArgumentCompletions: completions,
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase();
			let name: PresetName | undefined;
			if (requested && requested in PRESETS) {
				name = requested as PresetName;
			} else if (!requested && ctx.hasUI) {
				const choice = await ctx.ui.select(
					"Permission preset (this session only)",
					CYCLE.map((candidate) => `${candidate} — ${PRESETS[candidate].description}`),
				);
				name = choice?.split(" — ", 1)[0] as PresetName | undefined;
			}
			if (!name) {
				ctx.ui.notify("Usage: /permission-preset default|readonly|yolo|auto", "warning");
				return;
			}
			applyPreset(name, ctx);
		},
	});

	pi.registerShortcut("shift+tab", {
		description: "Cycle this session's permission preset",
		handler: (ctx) => {
			const next = CYCLE[(CYCLE.indexOf(getPreset()) + 1) % CYCLE.length];
			applyPreset(next, ctx);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		registerLink();
		syncPresetUi(ctx);
	});

	// Fired after pi-permission-system publishes its service at session_start;
	// covers the load-order case where its session_start runs after ours.
	pi.events.on("permissions:ready", () => {
		registerLink();
	});
}
