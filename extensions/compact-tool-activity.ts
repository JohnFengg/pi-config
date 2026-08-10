import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  ToolExecutionComponent,
  renderDiff,
  rawKeyHint,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, sliceByColumn, Text, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

/**
 * Compact tool activity with controllable per-block expand/collapse.
 *
 * Defaults: every tool row (including edit) stays one line.
 *
 * Controls (Mac / classic-terminal safe):
 *   ctrl+o / cmd+o     toggle selected/latest tool block
 *   ctrl+o ctrl+o      double-tap within 400ms → toggle ALL blocks
 *   /tool-expand       status + tips /tool-expand all|last|clear
 *
 * Why not ctrl+shift+o? Most terminals cannot distinguish Ctrl+Shift+O from
 * Ctrl+O (both send 0x0f) unless Kitty keyboard protocol / modifyOtherKeys is
 * active. Double-tap works everywhere.
 *
 * app.tools.expand is unbound in ~/.pi/agent/keybindings.json so this extension
 * owns ctrl+o / super+o without fighting the built-in global handler.
 */

type CompactSettings = {
  /** When true, newly rendered rows start expanded. Default false. */
  defaultExpanded: boolean;
  /** Show a dim key hint on the selected/latest collapsed row. Default true. */
  showExpandHint: boolean;
};

const SETTINGS_PATH = join(homedir(), ".pi/agent/compact-tool-activity.json");
const DEFAULT_SETTINGS: CompactSettings = {
  defaultExpanded: false,
  showExpandHint: true,
};

type ToolRow = {
  toolCallId: string;
  toolName: string;
  label: string;
  invalidate: () => void;
  hasOutput: boolean;
};

class HangingText {
  private firstPrefix: string;
  private continuationPrefix: string;
  private body: string;

  constructor(firstPrefix: string, body: string, continuationPrefix?: string) {
    this.firstPrefix = firstPrefix;
    this.continuationPrefix = continuationPrefix ?? " ".repeat(visibleWidth(firstPrefix));
    this.body = body;
  }

  setContent(firstPrefix: string, body: string, continuationPrefix?: string) {
    this.firstPrefix = firstPrefix;
    this.continuationPrefix = continuationPrefix ?? " ".repeat(visibleWidth(firstPrefix));
    this.body = body;
  }

  invalidate() {}

  render(width: number): string[] {
    const indent = Math.max(visibleWidth(this.firstPrefix), visibleWidth(this.continuationPrefix));
    const contentWidth = Math.max(1, width - indent);
    const wrapped = wrapTextWithAnsi(this.body.replace(/\t/g, "   "), contentWidth);
    return wrapped.map((line, index) => {
      const prefix = index === 0 ? this.firstPrefix : this.continuationPrefix;
      const rendered = prefix + line;
      return rendered + " ".repeat(Math.max(0, width - visibleWidth(rendered)));
    });
  }
}

class DiffGutterText {
  constructor(private diffText: string) {}
  invalidate() {}

  private colorizeLine(line: string, rawLine: string): string {
    const foregroundAnsi = /\x1b\[(?:3[0-9]|9[0-7]|38;(?:2;\d+;\d+;\d+|5;\d+))m/g;
    const cleanLine = line.replace(foregroundAnsi, "");
    if (rawLine.startsWith("+")) {
      return `\x1b[48;2;221;242;225m\x1b[38;2;35;92;47m${cleanLine}\x1b[39m\x1b[49m`;
    }
    if (rawLine.startsWith("-")) {
      return `\x1b[48;2;246;220;221m\x1b[38;2;138;48;52m${cleanLine}\x1b[39m\x1b[49m`;
    }
    return line;
  }

  render(width: number): string[] {
    const rawLines = this.diffText.split("\n");
    const styledLines = renderDiff(this.diffText).split("\n");
    const gutterWidth = rawLines.reduce((maximum, line) => {
      const match = line.match(/^([+\- ])(\s*\d*)\s/);
      return Math.max(maximum, match ? 1 + match[2].length + 1 : 0);
    }, 0);
    const result: string[] = [];

    for (let index = 0; index < styledLines.length; index++) {
      const styledLine = styledLines[index] ?? "";
      const rawLine = rawLines[index] ?? "";
      const parsed = /^([+\- ])(\s*\d*)\s/.test(rawLine);
      if (!parsed || gutterWidth === 0) {
        for (const wrapped of wrapTextWithAnsi(styledLine, Math.max(1, width))) {
          const padded = wrapped + " ".repeat(Math.max(0, width - visibleWidth(wrapped)));
          result.push(this.colorizeLine(padded, rawLine));
        }
        continue;
      }

      const gutter = sliceByColumn(styledLine, 0, gutterWidth);
      const content = sliceByColumn(styledLine, gutterWidth, Math.max(0, visibleWidth(styledLine) - gutterWidth));
      const wrappedContent = wrapTextWithAnsi(content, Math.max(1, width - gutterWidth));
      for (let visualLine = 0; visualLine < wrappedContent.length; visualLine++) {
        const prefix = visualLine === 0
          ? gutter + " ".repeat(Math.max(0, gutterWidth - visibleWidth(gutter)))
          : " ".repeat(gutterWidth);
        const rendered = prefix + wrappedContent[visualLine];
        const padded = rendered + " ".repeat(Math.max(0, width - visibleWidth(rendered)));
        result.push(this.colorizeLine(padded, rawLine));
      }
    }
    return result;
  }
}

function loadSettings(): CompactSettings {
  try {
    if (!existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS };
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Partial<CompactSettings>;
    return {
      defaultExpanded: raw.defaultExpanded ?? DEFAULT_SETTINGS.defaultExpanded,
      showExpandHint: raw.showExpandHint ?? DEFAULT_SETTINGS.showExpandHint,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: CompactSettings) {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function decorateEditComponent(component: any) {
  if (!(component instanceof Box)) return;
  component.setBgFn((text: string) => {
    const foreground = "\x1b[38;2;45;45;45m";
    const background = "\x1b[48;2;226;226;226m";
    const restoreForeground = text.replace(/\x1b\[39m/g, `\x1b[39m${foreground}`);
    return `${background}${foreground}${restoreForeground}\x1b[39m\x1b[49m`;
  });

  const preview = component.preview;
  if (!preview || "error" in preview) return;
  const children = component.children as any[];
  const lastChild = children[children.length - 1];
  if (lastChild instanceof DiffGutterText) return;
  if (lastChild instanceof Text) {
    component.removeChild(lastChild);
    component.addChild(new DiffGutterText(preview.diff));
  }
}

function shorten(value: unknown, max = 72): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function describe(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "read": return `Read ${args.path ?? "file"}`;
    case "bash": return `Run ${shorten(args.command)}`;
    case "edit": return `Edit ${args.path ?? "file"}${Array.isArray(args.edits) ? ` (${args.edits.length} change${args.edits.length === 1 ? "" : "s"})` : ""}`;
    case "write": return `Write ${args.path ?? "file"}`;
    case "grep": return `Search ${JSON.stringify(args.pattern ?? "")} ${args.path ? `in ${args.path}` : ""}`.trim();
    case "find": return `Find ${JSON.stringify(args.pattern ?? "")} ${args.path ? `in ${args.path}` : ""}`.trim();
    case "ls": return `List ${args.path ?? "."}`;
    default: return tool;
  }
}

function outputText(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? [])
    .map((item) => item.type === "text" ? item.text ?? "" : `[${item.type}]`)
    .filter(Boolean)
    .join("\n")
    .trim();
}

// Shared across /reload so the one-time prototype patch always sees live state.
const SHARED = Symbol.for("pi.compact-tool-activity.shared-state");
type SharedState = {
  expandedIds: Set<string>;
  rows: Map<string, ToolRow>;
  order: string[];
  selectedId: string | undefined;
  settings: CompactSettings;
};
function getShared(): SharedState {
  const g = globalThis as any;
  if (!g[SHARED]) {
    g[SHARED] = {
      expandedIds: new Set<string>(),
      rows: new Map<string, ToolRow>(),
      order: [] as string[],
      selectedId: undefined as string | undefined,
      settings: loadSettings(),
    } satisfies SharedState;
  }
  return g[SHARED] as SharedState;
}

export default function (pi: ExtensionAPI) {
  const shared = getShared();
  shared.settings = loadSettings();
  const { expandedIds, rows, order } = shared;
  // Fresh session wiring; keep expand sets so /reload does not lose open blocks.
  let ui: ExtensionContext["ui"] | undefined;
  const getSelectedId = () => shared.selectedId;
  const setSelectedId = (id: string | undefined) => {
    shared.selectedId = id;
  };

  const rememberUi = (_event: unknown, ctx: ExtensionContext) => {
    ui = ctx.ui;
  };
  pi.on("session_start", rememberUi);
  pi.on("session_before_switch", rememberUi);

  function touchRow(
    context: { toolCallId: string; invalidate: () => void },
    tool: string,
    args: Record<string, unknown>,
    hasOutput?: boolean,
  ) {
    const id = context.toolCallId;
    const existing = rows.get(id);
    if (!existing) {
      order.push(id);
      if (shared.settings.defaultExpanded) expandedIds.add(id);
      // Auto-select the newest row so ctrl+o / cmd+o targets what just happened.
      setSelectedId(id);
    }
    rows.set(id, {
      toolCallId: id,
      toolName: tool,
      label: describe(tool, args),
      invalidate: () => context.invalidate(),
      hasOutput: hasOutput ?? existing?.hasOutput ?? false,
    });
  }

  function invalidateRow(id: string | undefined) {
    if (!id) return;
    rows.get(id)?.invalidate();
  }

  function isExpanded(toolCallId: string, globalExpanded: boolean): boolean {
    return globalExpanded || expandedIds.has(toolCallId);
  }

  function targetId(): string | undefined {
    const selectedId = getSelectedId();
    if (selectedId && rows.has(selectedId)) return selectedId;
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i]!;
      if (rows.has(id)) return id;
    }
    return undefined;
  }

  function toggleId(id: string | undefined, ctx?: ExtensionContext) {
    if (!id || !rows.has(id)) {
      ctx?.ui.notify("No tool block to expand", "warning");
      return;
    }
    if (expandedIds.has(id)) expandedIds.delete(id);
    else expandedIds.add(id);
    setSelectedId(id);
    rows.get(id)?.invalidate();
    const row = rows.get(id)!;
    const state = expandedIds.has(id) ? "expanded" : "collapsed";
    (ctx?.ui ?? ui)?.notify(`${row.label}: ${state}`, "info");
  }

  function moveSelection(delta: number, ctx: ExtensionContext) {
    if (order.length === 0) {
      ctx.ui.notify("No tool blocks yet", "warning");
      return;
    }
    const ids = order.filter((id) => rows.has(id));
    if (ids.length === 0) return;
    const selectedId = getSelectedId();
    const current = selectedId && ids.includes(selectedId) ? selectedId : ids[ids.length - 1]!;
    const index = ids.indexOf(current);
    const next = ids[Math.max(0, Math.min(ids.length - 1, index + delta))]!;
    const prev = selectedId;
    setSelectedId(next);
    invalidateRow(prev);
    invalidateRow(next);
    const row = rows.get(next)!;
    ctx.ui.notify(`Selected: ${row.label}`, "info");
  }

  function statusDot(theme: any, context: { isPartial: boolean; isError: boolean }, selected: boolean): string {
    if (selected) {
      if (context.isPartial) return theme.fg("warning", "◆");
      if (context.isError) return theme.fg("error", "◆");
      return theme.fg("accent", "◆");
    }
    if (context.isPartial) return theme.fg("warning", "●");
    if (context.isError) return theme.fg("error", "●");
    return theme.fg("success", "●");
  }

  function expandHint(theme: any, toolCallId: string, expanded: boolean): string {
    if (!shared.settings.showExpandHint || expanded) return "";
    const isTarget = toolCallId === (getSelectedId() ?? order.filter((id) => rows.has(id)).at(-1));
    if (!isTarget) return "";
    return theme.fg("dim", `  ${rawKeyHint("ctrl+o", "expand · 2× all")}`);
  }

  function compactCallLine(
    tool: string,
    args: Record<string, unknown>,
    theme: any,
    context: any,
    expanded: boolean,
  ) {
    const line = context.lastComponent instanceof HangingText
      ? context.lastComponent
      : new HangingText("", "");
    const selected = context.toolCallId === getSelectedId();
    const status = statusDot(theme, context, selected);
    const title = theme.fg(selected ? "accent" : "toolTitle", describe(tool, args));
    const suffix = expanded
      ? theme.fg("dim", `  ${rawKeyHint("ctrl+o", "collapse")}`)
      : expandHint(theme, context.toolCallId, expanded);
    line.setContent(` ${status} `, `${title}${suffix}`);
    return line;
  }

  function compact(tool: string, definition: any) {
    return {
      ...definition,
      renderShell: "self" as const,
      renderCall(args: Record<string, unknown>, theme: any, context: any) {
        touchRow(context, tool, args);
        const expanded = isExpanded(context.toolCallId, !!context.expanded);
        return compactCallLine(tool, args, theme, context, expanded);
      },
      renderResult(
        result: { content?: Array<{ type: string; text?: string }> },
        options: { expanded: boolean },
        theme: any,
        context: any,
      ) {
        const output = outputText(result);
        touchRow(context, tool, context.args ?? {}, output.length > 0);
        const expanded = isExpanded(context.toolCallId, options.expanded);
        if (!expanded) return new Container();
        return output ? new HangingText("   ", theme.fg("toolOutput", output), "   ") : new Container();
      },
    };
  }

  // Keep collapsed self-rendered tools adjacent even after Pi package updates.
  // Symbol.for prevents wrapping the prototype repeatedly on /reload.
  const prototype = ToolExecutionComponent.prototype as any;
  const compactRenderPatch = Symbol.for("pi.compact-tool-activity.render-patched");
  if (!prototype[compactRenderPatch]) {
    const originalRender = prototype.render;
    prototype.render = function (width: number) {
      const lines: string[] = originalRender.call(this, width);
      // Drop the leading spacer when the row is a single-line collapsed summary.
      const locallyOpen = getShared().expandedIds.has(this.toolCallId);
      if (!this.expanded && !locallyOpen && lines[0] === "") {
        return lines.slice(1);
      }
      return lines;
    };

    // When global collapse (ctrl+shift+o) walks a row that was expanded, drop its
    // local expand so "collapse all" really means all. Only clear on true→false
    // transitions so chat rebuilds keep local expands.
    const originalSetExpanded = prototype.setExpanded;
    prototype.setExpanded = function (expanded: boolean) {
      if (this.expanded && !expanded) {
        getShared().expandedIds.delete(this.toolCallId);
      }
      return originalSetExpanded.call(this, expanded);
    };

    prototype[compactRenderPatch] = true;
  }

  const cwd = process.cwd();
  pi.registerTool(compact("read", createReadToolDefinition(cwd)));
  pi.registerTool(compact("bash", createBashToolDefinition(cwd)));

  // Edit: same one-line collapsed summary; expand reveals the rich diff box.
  const editDefinition = createEditToolDefinition(cwd);
  const renderEditCall = editDefinition.renderCall!;
  const renderEditResult = editDefinition.renderResult!;
  pi.registerTool({
    ...editDefinition,
    renderShell: "self" as const,
    renderCall(args, theme, context) {
      touchRow(context, "edit", args as Record<string, unknown>, true);
      const expanded = isExpanded(context.toolCallId, !!context.expanded);
      if (!expanded) {
        return compactCallLine("edit", args as Record<string, unknown>, theme, context, false);
      }
      const component = renderEditCall(args, theme, context);
      decorateEditComponent(component);
      return component;
    },
    renderResult(result, options, theme, context) {
      touchRow(context, "edit", (context.args ?? {}) as Record<string, unknown>, true);
      const expanded = isExpanded(context.toolCallId, options.expanded);
      if (!expanded) return new Container();
      const component = renderEditResult(result, { ...options, expanded: true }, theme, context);
      decorateEditComponent(component);
      return component;
    },
  });

  pi.registerTool(compact("write", createWriteToolDefinition(cwd)));
  pi.registerTool(compact("grep", createGrepToolDefinition(cwd)));
  pi.registerTool(compact("find", createFindToolDefinition(cwd)));
  pi.registerTool(compact("ls", createLsToolDefinition(cwd)));

  // --- Shortcuts (Mac: ctrl+o / cmd+o; no shift+letter — terminals often can't tell) ---
  const DOUBLE_TAP_MS = 400;
  let pendingSingle: ReturnType<typeof setTimeout> | undefined;
  let pendingCtx: ExtensionContext | undefined;

  const toggleAll = (ctx: ExtensionContext) => {
    const next = !ctx.ui.getToolsExpanded();
    ctx.ui.setToolsExpanded(next);
    if (!next) expandedIds.clear();
    for (const row of rows.values()) row.invalidate();
    ctx.ui.notify(`Tool output: ${next ? "expanded (all)" : "collapsed (all)"}`, "info");
  };

  const handleExpandShortcut = async (ctx: ExtensionContext) => {
    ui = ctx.ui;
    // Second press inside the window → cancel pending single, toggle ALL.
    // Classic terminals cannot distinguish ctrl+shift+o from ctrl+o.
    if (pendingSingle) {
      clearTimeout(pendingSingle);
      pendingSingle = undefined;
      pendingCtx = undefined;
      toggleAll(ctx);
      return;
    }
    pendingCtx = ctx;
    pendingSingle = setTimeout(() => {
      pendingSingle = undefined;
      const c = pendingCtx;
      pendingCtx = undefined;
      if (c) toggleId(targetId(), c);
    }, DOUBLE_TAP_MS);
  };

  // Requires app.tools.expand unbound (or rebound off ctrl+o) in keybindings.json.
  pi.registerShortcut("ctrl+o", {
    description: "Toggle selected tool block (double-tap: toggle all)",
    handler: handleExpandShortcut,
  });
  pi.registerShortcut("super+o", {
    description: "Toggle selected tool block (Cmd+O; double-tap: toggle all)",
    handler: handleExpandShortcut,
  });

  pi.registerCommand("tool-expand", {
    description: "Show/toggle compact tool expand controls",
    handler: async (args, ctx) => {
      ui = ctx.ui;
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "on" || arg === "default-on") {
        shared.settings.defaultExpanded = true;
        saveSettings(shared.settings);
        ctx.ui.notify("New tool rows will start expanded", "info");
        return;
      }
      if (arg === "off" || arg === "default-off") {
        shared.settings.defaultExpanded = false;
        saveSettings(shared.settings);
        ctx.ui.notify("New tool rows will start collapsed", "info");
        return;
      }
      if (arg === "last" || arg === "toggle") {
        toggleId(targetId(), ctx);
        return;
      }
      if (arg === "all") {
        toggleAll(ctx);
        return;
      }
      if (arg === "clear") {
        expandedIds.clear();
        for (const row of rows.values()) row.invalidate();
        ctx.ui.setToolsExpanded(false);
        ctx.ui.notify("All tool blocks collapsed", "info");
        return;
      }

      const selectedId = getSelectedId();
      const selected = selectedId ? rows.get(selectedId) : undefined;
      const localOpen = expandedIds.size;
      const global = ctx.ui.getToolsExpanded();
      ctx.ui.notify(
        [
          `compact tools · global=${global ? "expanded" : "collapsed"} · localOpen=${localOpen} · defaultExpanded=${shared.settings.defaultExpanded}`,
          selected ? `selected: ${selected.label}` : "selected: (latest)",
          `${rawKeyHint("ctrl+o", "toggle block")} · double ${rawKeyHint("ctrl+o", "toggle all")} · ${rawKeyHint("super+o", "cmd+o same")}`,
          `/tool-expand last|all|clear|default-on|default-off`,
        ].join("\n"),
        "info",
      );
    },
  });
}
