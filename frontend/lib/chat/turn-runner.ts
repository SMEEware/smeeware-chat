"use client";

import type { QueryClient } from "@tanstack/react-query";

import { chatKeys, invalidateChatList } from "@/hooks/use-chats";
import { attachmentBlock } from "@/lib/chat/attachments";
import { fromStored, saveChat, toStored } from "@/lib/chat/history";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { parseSseStream, readErrorMessage } from "@/lib/chat/stream";
import type {
  Attachment,
  ChatMessage,
  MessagePart,
  QueuedMessage,
  StreamFrame,
  WireMessage,
} from "@/lib/chat/types";
import { workspaceBlock } from "@/lib/workspaces/store";
import type { Workspace } from "@/lib/workspaces/store";

export type ReturnedInput = { text: string; attachments: Attachment[] };

export type Snapshot = {
  messages: ChatMessage[];
  streaming: boolean;
  error: Error | null;
  queued: QueuedMessage[];
};

type TurnOptions = Omit<TurnArgs, "chatId" | "history">;

type TurnRun = {
  snapshot: Snapshot;
  listener: Set<() => void>;
  cleanup: ReturnType<typeof setTimeout> | null;
  restore: ((r: ReturnedInput) => void) | null;
  controller: AbortController | null;
  chain: Promise<unknown>;
  model: string | null;

  parts: MessagePart[];
  content: string;
  tail: string;
  activeId: string | null;
  startedAt: number;
  dirty: boolean;
  frame: number | null;
  lastCheckpoint: number;

  streamId: string | null;
  options: TurnOptions | null;
};

const runs = new Map<string, TurnRun>();

const NO_QUEUED: QueuedMessage[] = [];

const EMPTY: Snapshot = {
  messages: [],
  streaming: false,
  error: null,
  queued: NO_QUEUED,
};

const MAX_CHARS = 60_000;
const MAX_MESSAGES = 120;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function toWire(
  allMessages: ChatMessage[],
  workspace: Workspace | null = null,
): WireMessage[] {
  const messages = allMessages.filter((m) => !m.hidden);

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  const wsBlock = workspaceBlock(workspace);

  const clean: WireMessage[] = [];
  messages.forEach((message, index) => {
    let content: string;
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
      if (index === lastUserIndex && wsBlock) blocks.push(wsBlock);
      const attachment = blocks.filter(Boolean).join("\n\n");
      content = (
        attachment ? `${message.content}\n\n${attachment}` : message.content
      ).trim();
    }
    if (!content) return;

    const prior = clean.at(-1);
    if (prior && prior.role === message.role) {
      prior.content = `${prior.content}\n\n${content}`;
      return;
    }
    clean.push({ role: message.role, content });
  });

  let viewport = clean.slice(-MAX_MESSAGES);
  while (viewport.length > 0 && viewport[0].role !== "user") {
    viewport = viewport.slice(1);
  }
  return viewport.map((m) => ({ ...m, content: truncate(m.content) }));
}

function lastQuestionInCall(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].viaCall === true;
  }
  return false;
}

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const head = Math.floor(MAX_CHARS * 0.7);
  const tail = MAX_CHARS - head;
  const excess = text.length - MAX_CHARS;
  return `${text.slice(0, head)}\n\n[… ${excess} characters omitted …]\n\n${text.slice(-tail)}`;
}

function createRun(messages: ChatMessage[]): TurnRun {
  return {
    snapshot: {
      messages,
      streaming: false,
      error: null,
      queued: NO_QUEUED,
    },
    listener: new Set(),
    cleanup: null,
    restore: null,
    controller: null,
    chain: Promise.resolve(),
    model: null,
    parts: [],
    content: "",
    tail: "",
    activeId: null,
    startedAt: 0,
    dirty: false,
    frame: null,
    lastCheckpoint: 0,
    streamId: null,
    options: null,
  };
}

function runFor(chatId: string, initial?: ChatMessage[]): TurnRun {
  let existing = runs.get(chatId);
  if (!existing) {
    existing = createRun(initial ?? []);
    runs.set(chatId, existing);
  }
  return existing;
}

function updateSnapshot(l: TurnRun, part: Partial<Snapshot>): void {
  l.snapshot = { ...l.snapshot, ...part };
  for (const listener of l.listener) listener();
}

export function getSnapshot(chatId: string): Snapshot {
  return runs.get(chatId)?.snapshot ?? EMPTY;
}

export function getServerSnapshot(): Snapshot {
  return EMPTY;
}

const LINGER_MS = 30_000;

export function subscribe(
  chatId: string,
  listener: () => void,
  initial?: ChatMessage[],
): () => void {
  const l = runFor(chatId, initial);
  l.listener.add(listener);

  if (l.cleanup !== null) {
    clearTimeout(l.cleanup);
    l.cleanup = null;
  }

  return () => {
    const current = runs.get(chatId);
    if (!current) return;
    current.listener.delete(listener);
    scheduleCleanup(chatId);
  };
}

function scheduleCleanup(chatId: string): void {
  const l = runs.get(chatId);
  if (!l || l.cleanup !== null) return;
  if (l.listener.size > 0 || l.snapshot.streaming) return;

  l.cleanup = setTimeout(() => {
    const now = runs.get(chatId);
    if (!now) return;
    now.cleanup = null;
    if (now.listener.size === 0 && !now.snapshot.streaming) {
      runs.delete(chatId);
    }
  }, LINGER_MS);
}

export function seedHistory(chatId: string, messages: ChatMessage[]): void {
  const l = runFor(chatId, messages);
  if (l.snapshot.streaming || l.snapshot.messages.length > 0) return;
  updateSnapshot(l, { messages });
}

export function addComment(
  chatId: string,
  messageId: string,
  text: string,
  client: QueryClient,
): void {
  const l = runs.get(chatId);
  if (!l) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  updateSnapshot(l, {
    messages: l.snapshot.messages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            comments: [
              ...(message.comments ?? []),
              {
                id: newId(),
                text: trimmed,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : message,
    ),
  });
  persist(chatId, l, client);
}

export function updateComment(
  chatId: string,
  messageId: string,
  commentId: string,
  text: string,
  client: QueryClient,
): void {
  const l = runs.get(chatId);
  if (!l) return;
  const trimmed = text.trim();
  if (!trimmed) {
    removeComment(chatId, messageId, commentId, client);
    return;
  }

  updateSnapshot(l, {
    messages: l.snapshot.messages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            comments: (message.comments ?? []).map((comment) =>
              comment.id === commentId
                ? { ...comment, text: trimmed }
                : comment,
            ),
          }
        : message,
    ),
  });
  persist(chatId, l, client);
}

export function removeComment(
  chatId: string,
  messageId: string,
  commentId: string,
  client: QueryClient,
): void {
  const l = runs.get(chatId);
  if (!l) return;

  updateSnapshot(l, {
    messages: l.snapshot.messages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            comments: (message.comments ?? []).filter(
              (comment) => comment.id !== commentId,
            ),
          }
        : message,
    ),
  });
  persist(chatId, l, client);
}

export function setMessageHidden(
  chatId: string,
  messageId: string,
  hidden: boolean,
  client: QueryClient,
): void {
  const l = runs.get(chatId);
  if (!l) return;

  updateSnapshot(l, {
    messages: l.snapshot.messages.map((message) =>
      message.id === messageId ? { ...message, hidden } : message,
    ),
  });
  persist(chatId, l, client);
}

export function setRestoreHandler(
  chatId: string,
  handler: ((r: ReturnedInput) => void) | null,
): void {
  runFor(chatId).restore = handler;
}

export function clearError(chatId: string): void {
  const l = runs.get(chatId);
  if (l?.snapshot.error) updateSnapshot(l, { error: null });
}

export function stopTurn(chatId: string): void {
  runs.get(chatId)?.controller?.abort();
}

export function isRunning(chatId: string): boolean {
  return runs.get(chatId)?.snapshot.streaming ?? false;
}

export function steer(chatId: string, text: string): boolean {
  const l = runs.get(chatId);
  const clean = text.trim();
  if (!l || !l.snapshot.streaming || !l.streamId || !clean) return false;

  const entry: QueuedMessage = { id: newId(), text: clean };
  updateSnapshot(l, { queued: [...l.snapshot.queued, entry] });

  void fetch("/api/chat/steer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stream_id: l.streamId,
      id: entry.id,
      content: clean,
    }),
  }).catch(() => {});
  return true;
}

export function withdrawSteer(chatId: string, id: string): void {
  const l = runs.get(chatId);
  if (!l) return;
  const rest = l.snapshot.queued.filter((q) => q.id !== id);
  if (rest.length === l.snapshot.queued.length) return;
  updateSnapshot(l, { queued: rest.length ? rest : NO_QUEUED });

  if (!l.streamId) return;
  const params = new URLSearchParams({ stream_id: l.streamId, id });
  void fetch(`/api/chat/steer?${params}`, { method: "DELETE" }).catch(
    () => {},
  );
}

function persist(
  chatId: string,
  l: TurnRun,
  client: QueryClient,
  { interim = false }: { interim?: boolean } = {},
): void {
  const content = toStored(l.snapshot.messages);
  if (content.length === 0) return;

  l.lastCheckpoint = performance.now();
  l.chain = l.chain
    .then(() => saveChat(chatId, { messages: content, model: l.model }))
    .then((saved) => {
      client.setQueryData(chatKeys.detail(chatId), {
        ...saved,
        messages: fromStored(saved.messages),
      });
      if (interim) return;
      return invalidateChatList(client);
    })
    .catch((error) => {
      console.error("Could not save chat:", error);
    });
}

const CHECKPOINT_INTERVAL_MS = 2000;

function checkpoint(
  chatId: string,
  l: TurnRun,
  client: QueryClient,
  immediate = false,
): void {
  if (!immediate && performance.now() - l.lastCheckpoint < CHECKPOINT_INTERVAL_MS) return;
  flush(l);
  persist(chatId, l, client, { interim: true });
}

function flush(l: TurnRun): void {
  l.frame = null;
  if (!l.dirty || !l.activeId) return;
  l.dirty = false;

  const parts = l.parts.map((part) => ({ ...part }));
  const content = l.content;
  const id = l.activeId;

  updateSnapshot(l, {
    messages: l.snapshot.messages.map((message) =>
      message.id === id ? { ...message, parts, content } : message,
    ),
  });
}

function plane(l: TurnRun): void {
  if (l.frame !== null) return;
  l.frame = requestAnimationFrame(() => flush(l));
}

function appendPart(l: TurnRun, type: "content" | "reasoning", text: string): void {
  const last = l.parts[l.parts.length - 1];
  if (last && last.type === type) {
    l.parts[l.parts.length - 1] = { type, text: last.text + text };
  } else {
    l.parts.push({ type, text });
  }
}

type TurnArgs = {
  chatId: string;
  history: ChatMessage[];
  model: string | null;
  prompt: string | null;
  tools: boolean;
  voiceId: string;
  ttsModel: string | null;
  workspace: Workspace | null;
  client: QueryClient;
};

export function startTurn({
  chatId,
  history,
  model,
  prompt,
  tools,
  voiceId,
  ttsModel,
  workspace,
  client,
}: TurnArgs): boolean {
  const l = runFor(chatId);
  if (l.snapshot.streaming) return false;

  const id = newId();
  l.activeId = id;
  l.model = model;
  l.streamId = newId();
  l.options = { model, prompt, tools, voiceId, ttsModel, workspace, client };
  l.parts = [];
  l.content = "";
  l.tail = "";
  l.startedAt = performance.now();
  l.dirty = false;
  l.lastCheckpoint = 0;

  const controller = new AbortController();
  l.controller = controller;

  updateSnapshot(l, {
    messages: [
      ...history,
      {
        id,
        role: "assistant",
        content: "",
        parts: [],
        streaming: true,
        model: model ?? undefined,
      },
    ],
    streaming: true,
    error: null,
  });

  persist(chatId, l, client);

  void runTurn(
    chatId,
    l,
    history,
    controller,
    { model, prompt, tools, voiceId, ttsModel, workspace },
    client,
  );
  return true;
}

async function runTurn(
  chatId: string,
  l: TurnRun,
  history: ChatMessage[],
  controller: AbortController,
  options: {
    model: string | null;
    prompt: string | null;
    tools: boolean;
    voiceId: string;
    ttsModel: string | null;
    workspace: Workspace | null;
  },
  client: QueryClient,
): Promise<void> {
  let aborted = false;
  let error: Error | null = null;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toWire(history, options.workspace),
        model: options.model ?? undefined,
        prompt: options.prompt ?? undefined,
        tools: options.tools,
        voice_id: options.voiceId || undefined,
        tts_model: options.ttsModel ?? undefined,
        stream_id: l.streamId ?? undefined,
        mode: lastQuestionInCall(history) ? "call" : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(await readErrorMessage(response));
    }

    for await (const frame of parseSseStream(
      response.body,
      controller.signal,
    )) {
      if (frame.type === "error") throw new Error(frame.error.message);

      let boundary = false;

      if (frame.type === "content") {
        if (frame.delta.length > 0) {
          let delta = frame.delta;

          const last = l.parts.at(-1);
          const continuation = last !== undefined && last.type !== "content";
          if (
            continuation &&
            l.tail !== "" &&
            !/\s$/.test(l.tail) &&
            !/^\s/.test(delta)
          ) {
            delta = " " + delta;
          }

          appendPart(l, "content", delta);
          l.content += delta;
          l.tail = delta.slice(-1);
        }
      } else if (frame.type === "reasoning") {
        if (frame.delta.length > 0) appendPart(l, "reasoning", frame.delta);
      } else if (frame.type === "steer") {
        splitAtSteer(chatId, l, frame, client);
        continue;
      } else if (frame.type === "tool_call") {
        l.parts.push({
          type: "tool",
          callId: frame.call_id,
          tool: frame.tool,
          arguments: frame.arguments,
          status: "running",
        });
        boundary = true;
      } else {
        const index = l.parts.findIndex(
          (part) => part.type === "tool" && part.callId === frame.call_id,
        );
        if (index !== -1) {
          const previous = l.parts[index] as Extract<
            MessagePart,
            { type: "tool" }
          >;
          l.parts[index] = {
            ...previous,
            status: frame.ok ? "ok" : "error",
            preview: frame.preview,
            length: frame.length,
          };
        }
        boundary = true;
      }

      l.dirty = true;
      plane(l);
      checkpoint(chatId, l, client, boundary);
      boundary = false;
    }
  } catch (err) {
    if (controller.signal.aborted) {
      aborted = true;
    } else if (err instanceof TypeError) {
      error = new Error(
        "The connection to the backend was lost. Try again.",
      );
    } else {
      error =
        err instanceof Error ? err : new Error("The turn failed.");
    }
  }

  finishTurn(chatId, l, history, client, { aborted, error });
}

function splitAtSteer(
  chatId: string,
  l: TurnRun,
  frame: Extract<StreamFrame, { type: "steer" }>,
  client: QueryClient,
): void {
  if (l.frame !== null) {
    cancelAnimationFrame(l.frame);
    l.frame = null;
  }
  l.dirty = true;
  flush(l);

  const previousId = l.activeId;
  const next = newId();
  const now = performance.now();
  const duration = Math.round(now - l.startedAt);

  l.activeId = next;
  l.parts = [];
  l.content = "";
  l.tail = "";
  l.startedAt = now;

  const question: ChatMessage = {
    id: frame.id,
    role: "user",
    content: frame.content,
  };
  const response: ChatMessage = {
    id: next,
    role: "assistant",
    content: "",
    parts: [],
    streaming: true,
    model: l.model ?? undefined,
  };

  const rest = l.snapshot.queued.filter((q) => q.id !== frame.id);
  updateSnapshot(l, {
    queued: rest.length ? rest : NO_QUEUED,
    messages: [
      ...l.snapshot.messages.map((message) =>
        message.id === previousId
          ? { ...message, streaming: false, durationMs: duration }
          : message,
      ),
      question,
      response,
    ],
  });
  persist(chatId, l, client, { interim: true });
}

function finishTurn(
  chatId: string,
  l: TurnRun,
  _history: ChatMessage[],
  client: QueryClient,
  result: { aborted: boolean; error: Error | null },
): void {
  l.controller = null;
  if (l.frame !== null) {
    cancelAnimationFrame(l.frame);
    l.frame = null;
  }

  const { aborted } = result;
  let { error } = result;

  if (aborted || error) {
    l.parts = l.parts.map((part) =>
      part.type === "tool" && part.status === "running"
        ? {
            ...part,
            status: "error",
            preview: aborted ? "Stopped before it finished." : "Interrupted.",
          }
        : part,
    );
  }
  l.dirty = true;
  flush(l);

  const id = l.activeId;
  l.activeId = null;
  const options = l.options;
  l.streamId = null;
  if (!id) return;

  const durationMs = Math.round(performance.now() - l.startedAt);

  const finished = l.snapshot.messages.find((m) => m.id === id);
  const hasContent =
    (finished?.parts?.length ?? 0) > 0 ||
    (finished?.content.trim().length ?? 0) > 0;

  if (!error && !aborted && !hasContent) {
    error = new Error("The model returned an empty answer. Try again.");
  }

  const waiting = l.snapshot.queued;

  if ((error || aborted) && !hasContent) {
    const withoutPlaceholder = l.snapshot.messages.filter((m) => m.id !== id);
    const last = withoutPlaceholder.at(-1);
    const returnQuestion = aborted && last?.role === "user";

    updateSnapshot(l, {
      streaming: false,
      error,
      queued: NO_QUEUED,
      messages: returnQuestion ? withoutPlaceholder.slice(0, -1) : withoutPlaceholder,
    });

    const texts = [
      ...(returnQuestion && last ? [last.content] : []),
      ...waiting.map((q) => q.text),
    ];
    if (texts.length > 0) {
      l.restore?.({
        text: texts.join("\n\n"),
        attachments: returnQuestion ? (last?.attachments ?? []) : [],
      });
    }

    persist(chatId, l, client);
    cleanupWhenIdle(chatId, l);
    return;
  }

  updateSnapshot(l, {
    streaming: false,
    error,
    queued: NO_QUEUED,
    messages: l.snapshot.messages.map((message) =>
      message.id === id
        ? {
            ...message,
            streaming: false,
            aborted,
            interrupted: error ? true : message.interrupted,
            durationMs,
          }
        : message,
    ),
  });

  persist(chatId, l, client);

  if (waiting.length > 0) {
    if (!error && !aborted && options) {
      startTurn({
        ...options,
        chatId,
        history: [
          ...l.snapshot.messages,
          {
            id: waiting[0].id,
            role: "user",
            content: waiting.map((q) => q.text).join("\n\n"),
          },
        ],
      });
      return;
    }
    l.restore?.({
      text: waiting.map((q) => q.text).join("\n\n"),
      attachments: [],
    });
  }

  cleanupWhenIdle(chatId, l);
}

function cleanupWhenIdle(chatId: string, l: TurnRun): void {
  if (l.listener.size > 0) return;
  void l.chain.then(() => scheduleCleanup(chatId));
}
