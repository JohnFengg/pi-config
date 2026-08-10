import assert from "node:assert/strict";
import { join } from "node:path";
import { createJiti } from "/Users/toussaint/.nvm/versions/node/v24.14.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";

const agentRoot = "/Users/toussaint/.nvm/versions/node/v24.14.1/lib/node_modules/@earendil-works/pi-coding-agent";
const tuiPath = join(agentRoot, "node_modules/@earendil-works/pi-tui/dist/index.js");
const agentPath = join(agentRoot, "dist/index.js");
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: {
    "@earendil-works/pi-tui": tuiPath,
    "@earendil-works/pi-coding-agent": agentPath,
  },
});

const codingAgent = await import(agentPath);
const tui = await import(tuiPath);
codingAgent.initTheme("gruvbox-dark");

// Code-fence extension must work against an unmodified Pi 0.82 Markdown class.
const codeExtension = await jiti.import(join(process.env.HOME, ".pi/agent/extensions/compact-code-blocks.ts"), { default: true });
codeExtension({});
const markdown = new tui.Markdown("```text\nhello world\n```\nafter", 0, 0, codingAgent.getMarkdownTheme());
const ansi = /\x1b\[[0-?]*[ -\/]*[@-~]/g;
const codeLines = markdown.render(40).map((line) => line.replace(ansi, "").trimEnd());
assert.equal(codeLines.some((line) => line.includes("```")), false, "literal Markdown fences must stay hidden after Pi updates");
assert.ok(codeLines.some((line) => line.startsWith("┌ text")));
assert.ok(codeLines.some((line) => line.startsWith("│ hello world")));
const bottomIndex = codeLines.findIndex((line) => line.startsWith("└"));
assert.ok(bottomIndex >= 0);
assert.equal(codeLines[bottomIndex - 1], "│ hello world", "fence token's synthetic trailing newline must not render as an empty code row");
assert.equal(codeLines[bottomIndex + 1], "after", "code block must not inject an extra blank row before following content");

// Thinking-spacing extension must re-wrap a renderer installed later by
// pi-thinking-steps during session_start.
const handlers = new Map();
const fakePi = { on(event, handler) { handlers.set(event, handler); } };
const thinkingExtension = await jiti.import(join(process.env.HOME, ".pi/agent/extensions/thinking-tool-spacing.ts"), { default: true });
const assistantPrototype = codingAgent.AssistantMessageComponent.prototype;
const originalUpdate = assistantPrototype.updateContent;
thinkingExtension(fakePi);

assistantPrototype.updateContent = function (message) {
  this.lastMessage = message;
  this.contentContainer.clear();
  this.contentContainer.addChild(new tui.Text("thinking", 0, 0));
};
await handlers.get("session_start")?.({}, {});
await new Promise((resolve) => setTimeout(resolve, 10));

const message = {
  role: "assistant",
  content: [
    { type: "thinking", thinking: "Inspecting files." },
    { type: "toolCall", id: "read-1", name: "read", arguments: { path: "README.md" } },
  ],
  stopReason: "toolUse",
};
const assistant = new codingAgent.AssistantMessageComponent(message, false, undefined, "Thinking...", 1);
assert.ok(assistant.contentContainer.children.at(-1) instanceof tui.Spacer, "thinking must retain a trailing separator after a later renderer patch");
assistantPrototype.updateContent = originalUpdate;

console.log("update-resistant rendering regression: pass");
