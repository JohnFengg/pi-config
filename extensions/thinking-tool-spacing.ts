import {
  AssistantMessageComponent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Spacer } from "@earendil-works/pi-tui";

const patchMarker = Symbol.for("pi.thinking-tool-spacing.wrapper");

/** Keeps one visual row between a trailing thinking block and tool activity. */
export default function (pi: ExtensionAPI) {
  const ensurePatch = () => {
    const prototype = AssistantMessageComponent.prototype as any;
    const currentUpdateContent = prototype.updateContent as any;
    if (currentUpdateContent?.[patchMarker]) return;

    const patchedUpdateContent = function (this: any, message: any) {
      currentUpdateContent.call(this, message);

      const content = Array.isArray(message?.content) ? message.content : [];
      let lastNarrativeIndex = -1;
      for (let i = content.length - 1; i >= 0; i--) {
        const part = content[i];
        if (part?.type === "thinking" && part.thinking?.trim()) {
          lastNarrativeIndex = i;
          break;
        }
        if (part?.type === "text" && part.text?.trim()) break;
      }

      if (lastNarrativeIndex < 0) return;
      const toolFollows = content.slice(lastNarrativeIndex + 1).some((part: any) => part?.type === "toolCall");
      if (!toolFollows) return;

      const children = this.contentContainer?.children ?? [];
      if (!(children[children.length - 1] instanceof Spacer)) {
        this.contentContainer.addChild(new Spacer(1));
      }
    };

    patchedUpdateContent[patchMarker] = true;
    prototype.updateContent = patchedUpdateContent;
  };

  // Patch native Pi immediately, then re-assert after pi-thinking-steps installs
  // its own session-time renderer patch.
  ensurePatch();
  pi.on("session_start", async () => {
    setTimeout(ensurePatch, 0);
  });
  pi.on("message_start", async () => {
    ensurePatch();
  });
}
