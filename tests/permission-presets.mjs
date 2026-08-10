import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "/Users/toussaint/.nvm/versions/node/v24.14.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";

const testAgentDir = "/tmp/pi-permission-presets-test";
rmSync(testAgentDir, { recursive: true, force: true });
process.env.PI_CODING_AGENT_DIR = testAgentDir;
const configDir = join(testAgentDir, "extensions/pi-permission-system");
mkdirSync(configDir, { recursive: true });
writeFileSync(join(configDir, "config.json"), JSON.stringify({ debugLog: true, permissionReviewLog: false }, null, 2));

const agentRoot = "/Users/toussaint/.nvm/versions/node/v24.14.1/lib/node_modules/@earendil-works/pi-coding-agent";
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: {
    "@earendil-works/pi-coding-agent": join(agentRoot, "dist/index.js"),
    "@earendil-works/pi-tui": join(agentRoot, "node_modules/@earendil-works/pi-tui/dist/index.js"),
  },
});
const extension = await jiti.import(join(process.env.HOME, ".pi/agent/extensions/permission-presets.ts"), { default: true });
const commands = new Map();
const shortcuts = new Map();
const events = new Map();
const emitted = [];
extension({
  events: { emit(name, payload) { emitted.push({ name, payload }); } },
  registerCommand(name, options) { commands.set(name, options); },
  registerShortcut(key, options) { shortcuts.set(key, options); },
  on(event, handler) { events.set(event, handler); },
});
assert.ok(commands.has("permission-preset"));
assert.ok(shortcuts.has("shift+tab"));

const notices = [];
const statuses = [];
const widgets = [];
const theme = {
  bold(text) { return `\x1b[1m${text}\x1b[22m`; },
  fg(_color, text) { return text; },
};
const ctx = {
  hasUI: true,
  ui: {
    theme,
    notify(message, level) { notices.push({ message, level }); },
    setStatus(key, value) { statuses.push({ key, value }); },
    setWidget(key, factory, options) {
      widgets.push({ key, options, lines: factory(null, theme).render(80) });
    },
    async select() { return undefined; },
  },
};

// Unknown/custom config cycles to default.
await shortcuts.get("shift+tab").handler(ctx);
let config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"));
assert.equal(config.debugLog, true, "unrelated runtime knobs must be preserved");
assert.equal(config.permissionReviewLog, false);
assert.equal(config.yoloMode, false);
assert.equal(config.permission.read, "allow");
assert.equal(config.permission.write, undefined);

// Next cycle is read-only.
await shortcuts.get("shift+tab").handler(ctx);
config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"));
assert.equal(config.permission.write, "deny");
assert.equal(config.permission.edit, "deny");
assert.equal(config.permission.bash, "deny");

// Direct command switches to yolo and renders a bold warning below the editor.
await commands.get("permission-preset").handler("yolo", ctx);
config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"));
assert.equal(config.yoloMode, false);
assert.deepEqual(config.permission, {
  "*": "allow",
  bash: { "*": "allow" },
  external_directory: { "*": "ask" },
});
assert.equal(notices.length, 0, "preset switches must not print foreground notifications");
assert.equal(emitted.at(-1).name, "permissions:preset-changed");
const permissionSystemSource = readFileSync(
  join(process.env.HOME, ".pi/agent/npm/node_modules/@gotgenes/pi-permission-system/src/index.ts"),
  "utf8",
);
assert.match(permissionSystemSource, /permissions:preset-changed/);
assert.match(permissionSystemSource, /configStore\.refresh\(ctx\)/, "permission system must refresh runtime yolo state immediately");
assert.equal(statuses.at(-1).value, undefined, "legacy status entry must be cleared");
assert.equal(widgets.at(-1).options.placement, "belowEditor");
const widgetLine = widgets.at(-1).lines[0];
assert.equal(widgetLine.replace(/\x1b\[[0-9;]*m/g, "").trim(), "yolo WARNING");
assert.match(widgetLine, /\x1b\[1m/, "preset widget must be bold");

rmSync(testAgentDir, { recursive: true, force: true });
console.log("permission presets regression: pass");
