import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Keeps normal assistant responses visually dense without altering meaning. */
export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\nPresentation preference: use compact Markdown. Format short section labels as bold text (for example, **Next steps:**). Do not insert a blank line between a short label or heading and the immediately following bullet or numbered list. Avoid gratuitous blank lines between closely related paragraphs. Keep blank lines where Markdown requires them, especially around code fences, tables, blockquotes, and distinct sections.`,
  }));
}
