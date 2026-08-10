import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const agentRoot = join(globalRoot, "@earendil-works/pi-coding-agent");
const { initTheme } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/theme/theme.js")));
const { renderDiff } = await import(pathToFileURL(join(agentRoot, "dist/modes/interactive/components/diff.js")));
const { sliceByColumn, visibleWidth, wrapTextWithAnsi } = await import(pathToFileURL(join(agentRoot, "node_modules/@earendil-works/pi-tui/dist/index.js")));
initTheme("gruvbox-dark");
const strip = (line) => line.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "").trimEnd();

function hanging(prefix, body, width) {
  const indent = visibleWidth(prefix);
  return wrapTextWithAnsi(body, width - indent).map((line, index) => (index ? " ".repeat(indent) : prefix) + line);
}

const status = hanging("● ", "Search a deliberately long query that wraps repeatedly", 20).map(strip);
assert.ok(status.length > 1);
assert.ok(status.slice(1).every((line) => line.startsWith("  ")), "status continuation must align after the dot");

const globe = hanging("🌐 ", "search a deliberately long query that wraps repeatedly", 20).map(strip);
const globeIndent = visibleWidth("🌐 ");
assert.ok(globe.slice(1).every((line) => line.startsWith(" ".repeat(globeIndent))), "emoji continuation must align after the icon column");

const rawDiff = "+123 const deliberatelyLongVariableName = someLongFunctionCall();";
const styled = renderDiff(rawDiff);
const gutterWidth = 5;
const gutter = sliceByColumn(styled, 0, gutterWidth);
const content = sliceByColumn(styled, gutterWidth, visibleWidth(styled) - gutterWidth);
const diffLines = wrapTextWithAnsi(content, 24 - gutterWidth).map((line, index) => (index ? " ".repeat(gutterWidth) : gutter) + line).map(strip);
assert.ok(diffLines.length > 1);
assert.ok(diffLines.slice(1).every((line) => line.startsWith(" ".repeat(gutterWidth))), "wrapped diff content must stay inside the code column");
assert.ok(diffLines.slice(1).every((line) => !/^[+\- ]?\d/.test(line.trimStart().slice(0, 1))), "continuations must not repeat or collide with line numbers");

const compact = readFileSync(join(process.env.HOME, ".pi/agent/extensions/compact-tool-activity.ts"), "utf8");
const web = readFileSync(join(process.env.HOME, ".pi/agent/npm/node_modules/pi-web-access/index.ts"), "utf8");
const subagents = readFileSync(join(process.env.HOME, ".pi/agent/npm/node_modules/pi-subagents/src/extension/index.ts"), "utf8");
assert.match(compact, /class HangingText/);
assert.match(compact, /class DiffGutterText/);
assert.match(compact, /sliceByColumn/);
assert.match(compact, /48;2;221;242;225m/, "added lines need a pale green background");
assert.match(compact, /48;2;246;220;221m/, "removed lines need a pale red background");
assert.match(web, /class HangingText/);
assert.match(subagents, /class HangingText/);
console.log("hanging indent regression: pass");
