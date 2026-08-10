import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const agentRoot = join(globalRoot, "@earendil-works/pi-coding-agent");
const { AssistantMessageComponent } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/components/assistant-message.js")));
const { initTheme } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/theme/theme.js")));

initTheme("gruvbox-dark");

const text = `第一段文字足够长，用来验证较窄终端中的连续自动换行不会插入空白行。这里继续补充文本以触发换行。\n\n**配置位置：**\n\n\`\`\`text\n~/.pi/agent/extensions/subagent/config.json\n\`\`\``;
const message = { role: "assistant", content: [{ type: "text", text }], stopReason: "stop" };
const component = new AssistantMessageComponent(message, false, undefined, "Thinking...", 1);
const ansi = /\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -\/]*[@-~]/g;
const lines = component.render(50).map((line) => line.replace(ansi, "").trimEnd());

assert.equal(lines.some((line) => line.includes("```")), false, "Markdown fences must not be displayed");
assert.equal(lines[0], "", "Keep exactly one separator row before the assistant card");
assert.notEqual(lines[1], "", "Assistant card must not add internal top padding");
const pathLine = lines.find((line) => line.includes("subagent/config.json"));
assert.match(pathLine ?? "", /^ │ /, "Fenced code must render as a code region");

const thinkingThenTool = {
  role: "assistant",
  content: [
    { type: "thinking", thinking: "Inspecting the relevant code path." },
    { type: "toolCall", id: "read-1", name: "read", arguments: { path: "README.md" } }
  ],
  stopReason: "toolUse"
};
const thinkingComponent = new AssistantMessageComponent(thinkingThenTool, false, undefined, "Thinking...", 1);
const thinkingLines = thinkingComponent.render(50).map((line) => line.replace(ansi, "").trimEnd());
assert.equal(thinkingLines.at(-1), "", "Thinking must keep one separator row before following tool activity");

console.log("terminal markdown regression: pass");
