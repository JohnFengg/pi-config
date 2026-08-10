import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const agentRoot = join(globalRoot, "@earendil-works/pi-coding-agent");
const { AssistantMessageComponent } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/components/assistant-message.js")));
const { initTheme } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/theme/theme.js")));
const { Spacer } = await import(pathToFileURL(join(agentRoot, "node_modules/@earendil-works/pi-tui/dist/index.js")));
initTheme("gruvbox-dark");

const prototype = AssistantMessageComponent.prototype;
const original = prototype.updateContent;
prototype.updateContent = function (message) {
  original.call(this, message);
  const content = message.content ?? [];
  let index = -1;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i]?.type === "thinking" && content[i].thinking?.trim()) { index = i; break; }
    if (content[i]?.type === "text" && content[i].text?.trim()) break;
  }
  if (index >= 0 && content.slice(index + 1).some((part) => part?.type === "toolCall")) {
    const children = this.contentContainer.children;
    if (!(children.at(-1) instanceof Spacer)) this.contentContainer.addChild(new Spacer(1));
  }
};

const message = {
  role: "assistant",
  content: [
    { type: "thinking", thinking: "Inspecting files." },
    { type: "toolCall", id: "read-1", name: "read", arguments: { path: "README.md" } }
  ],
  stopReason: "toolUse"
};
const component = new AssistantMessageComponent(message, false, undefined, "Thinking...", 1);
const lines = component.render(50).map((line) => line.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "").trimEnd());
assert.equal(lines.at(-1), "", "thinking must end with one separator row before a tool");

const extension = readFileSync(join(process.env.HOME, ".pi/agent/extensions/thinking-tool-spacing.ts"), "utf8");
assert.match(extension, /Symbol\.for\("pi\.thinking-tool-spacing\.patched"\)/);
assert.match(extension, /contentContainer\.addChild\(new Spacer\(1\)\)/);
console.log("thinking-tool spacing regression: pass");
