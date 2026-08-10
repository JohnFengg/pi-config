import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const agentRoot = join(globalRoot, "@earendil-works/pi-coding-agent");
const { ToolExecutionComponent } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/components/tool-execution.js")));
const { initTheme } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/theme/theme.js")));
const { Container, Text } = await import(pathToFileURL(join(agentRoot, "node_modules/@earendil-works/pi-tui/dist/index.js")));

initTheme("gruvbox-dark");

// Mirror the user extension's durable runtime patch against a clean Pi install.
const toolPrototype = ToolExecutionComponent.prototype;
const originalRender = toolPrototype.render;
toolPrototype.render = function (width) {
  const lines = originalRender.call(this, width);
  return this.toolName !== "edit" && !this.expanded && lines[0] === "" ? lines.slice(1) : lines;
};

const ui = { requestRender() {} };
const renderer = (name, renderShell = "self") => ({
  name,
  label: name,
  description: name,
  parameters: {},
  renderShell,
  execute: async () => ({ content: [] }),
  renderCall: () => new Text(name, 0, 0),
  renderResult: (_result, options) => options.expanded ? new Text("result", 0, 0) : new Container(),
});

const readTool = new ToolExecutionComponent("read", "read-1", {}, {}, renderer("read"), ui, process.cwd());
readTool.updateResult({ content: [{ type: "text", text: "result" }] });
assert.notEqual(readTool.render(40)[0], "", "collapsed routine tools must not add a separator row");
readTool.setExpanded(true);
assert.equal(readTool.render(40)[0], "", "manually expanded tools retain normal separation");

const editTool = new ToolExecutionComponent("edit", "edit-1", {}, {}, renderer("edit"), ui, process.cwd());
editTool.setExpanded(true);
assert.equal(editTool.render(40)[0], "", "edit retains prominent separation when expanded");

const compactExtension = readFileSync(join(process.env.HOME, ".pi/agent/extensions/compact-tool-activity.ts"), "utf8");
assert.match(compactExtension, /ToolExecutionComponent\.prototype/, "compact spacing must be restored at runtime after Pi updates");
assert.match(compactExtension, /renderShell: "self"/, "edit must keep Pi's native self-rendered rich diff");
assert.match(compactExtension, /48;2;226;226;226m/, "edit must use the visibly lighter gray ANSI surface");

console.log("tool visual hierarchy regression: pass");
