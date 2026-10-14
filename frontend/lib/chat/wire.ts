import { attachmentBlock, uploadedAttachmentIds } from "./attachments";
import { stripToolScaffolding } from "./sanitize";
import type { ChatMessage, WireMessage } from "./types";

const MAX_CHARS = 60_000;
const MAX_MESSAGES = 120;

export function toWire(allMessages: ChatMessage[], workspaceText = ""): WireMessage[] {
  const messages = allMessages.filter((message) => !message.hidden);
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  const clean: WireMessage[] = [];

  messages.forEach((message, index) => {
    let content: string;
    const ids = message.role === "user" ? uploadedAttachmentIds(message.attachments ?? []) : [];
    if (message.role === "assistant") {
      content = stripToolScaffolding(message.content).trim();
      if (message.aborted) {
        content = content
          ? `${content}\n\n[Stopped by the user before the answer was complete.]`
          : "[Stopped by the user before answering.]";
      } else if (message.interrupted) {
        content = content
          ? `${content}\n\n[This answer was cut off.]`
          : "[This answer was cut off before any text arrived.]";
      }
    } else {
      const blocks = [attachmentBlock(message.attachments ?? [])];
      if (index === lastUserIndex && workspaceText) blocks.push(workspaceText);
      content = [message.content, ...blocks].filter(Boolean).join("\n\n").trim();
    }
    if (!content && ids.length === 0) return;
    const prior = clean.at(-1);
    // Keep attachment-bearing questions separate so each retains its own file limit.
    if (prior?.role === message.role && !prior.attachment_ids?.length && ids.length === 0) {
      prior.content = `${prior.content}\n\n${content}`;
    } else {
      clean.push({ role: message.role, content, ...(ids.length ? { attachment_ids: ids } : {}) });
    }
  });

  let viewport = clean.slice(-MAX_MESSAGES);
  while (viewport.length && viewport[0].role !== "user") viewport = viewport.slice(1);
  return viewport.map((message) => ({ ...message, content: truncate(message.content) }));
}

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const head = Math.floor(MAX_CHARS * 0.7);
  const tail = MAX_CHARS - head;
  return `${text.slice(0, head)}\n\n[… ${text.length - MAX_CHARS} characters omitted …]\n\n${text.slice(-tail)}`;
}
