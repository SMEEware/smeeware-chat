"use client";

import type { QueryClient } from "@tanstack/react-query";

import { chatKeys, invalidateChatList } from "@/hooks/use-chats";
import { anhangBlock } from "@/lib/chat/attachments";
import { fromStored, saveChat, toStored } from "@/lib/chat/history";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { parseSseStream, readErrorMessage } from "@/lib/chat/stream";
import type {
  Attachment,
  ChatMessage,
  MessagePart,
  WireMessage,
} from "@/lib/chat/types";
import { workspaceBlock } from "@/lib/workspaces/store";
import type { Workspace } from "@/lib/workspaces/store";

export type Rueckgabe = { text: string; attachments: Attachment[] };

export type Schnappschuss = {
  messages: ChatMessage[];
  streaming: boolean;
  error: Error | null;
};

type Lauf = {
  schnapp: Schnappschuss;
  hoerer: Set<() => void>;
  aufraeumen: ReturnType<typeof setTimeout> | null;
  rueckgabe: ((r: Rueckgabe) => void) | null;
  controller: AbortController | null;
  kette: Promise<unknown>;
  model: string | null;

  parts: MessagePart[];
  content: string;
  tail: string;
  aktivId: string | null;
  startedAt: number;
  dirty: boolean;
  frame: number | null;
  letzterHalt: number;
};

const laeufe = new Map<string, Lauf>();

const LEER: Schnappschuss = {
  messages: [],
  streaming: false,
  error: null,
};

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function toWire(
  alleMessages: ChatMessage[],
  workspace: Workspace | null = null,
): WireMessage[] {
  const messages = alleMessages.filter((m) => !m.hidden);

  const letzterNutzer = messages.map((m) => m.role).lastIndexOf("user");
  const wsBlock = workspaceBlock(workspace);

  return messages.map(({ role, content, attachments }, index) => {
    if (role === "assistant") {
      return { role, content: stripToolScaffolding(content) };
    }
    const bloecke = [anhangBlock(attachments ?? [])];
    if (index === letzterNutzer && wsBlock) bloecke.push(wsBlock);
    const anhang = bloecke.filter(Boolean).join("\n\n");
    return { role, content: anhang ? `${content}\n\n${anhang}` : content };
  });
}

function neuerLauf(messages: ChatMessage[]): Lauf {
  return {
    schnapp: { messages, streaming: false, error: null },
    hoerer: new Set(),
    aufraeumen: null,
    rueckgabe: null,
    controller: null,
    kette: Promise.resolve(),
    model: null,
    parts: [],
    content: "",
    tail: "",
    aktivId: null,
    startedAt: 0,
    dirty: false,
    frame: null,
    letzterHalt: 0,
  };
}

function lauf(chatId: string, initial?: ChatMessage[]): Lauf {
  let vorhanden = laeufe.get(chatId);
  if (!vorhanden) {
    vorhanden = neuerLauf(initial ?? []);
    laeufe.set(chatId, vorhanden);
  }
  return vorhanden;
}

function aendere(l: Lauf, teil: Partial<Schnappschuss>): void {
  l.schnapp = { ...l.schnapp, ...teil };
  for (const hoerer of l.hoerer) hoerer();
}

export function schnappschuss(chatId: string): Schnappschuss {
  return laeufe.get(chatId)?.schnapp ?? LEER;
}

export function serverSchnappschuss(): Schnappschuss {
  return LEER;
}

const VERWEILDAUER = 30_000;

export function abonniere(
  chatId: string,
  hoerer: () => void,
  initial?: ChatMessage[],
): () => void {
  const l = lauf(chatId, initial);
  l.hoerer.add(hoerer);

  if (l.aufraeumen !== null) {
    clearTimeout(l.aufraeumen);
    l.aufraeumen = null;
  }

  return () => {
    const aktuell = laeufe.get(chatId);
    if (!aktuell) return;
    aktuell.hoerer.delete(hoerer);
    planeAufraeumen(chatId);
  };
}

function planeAufraeumen(chatId: string): void {
  const l = laeufe.get(chatId);
  if (!l || l.aufraeumen !== null) return;
  if (l.hoerer.size > 0 || l.schnapp.streaming) return;

  l.aufraeumen = setTimeout(() => {
    const jetzt = laeufe.get(chatId);
    if (!jetzt) return;
    jetzt.aufraeumen = null;
    if (jetzt.hoerer.size === 0 && !jetzt.schnapp.streaming) {
      laeufe.delete(chatId);
    }
  }, VERWEILDAUER);
}

export function setzeVerlauf(chatId: string, messages: ChatMessage[]): void {
  const l = lauf(chatId, messages);
  if (l.schnapp.streaming || l.schnapp.messages.length > 0) return;
  aendere(l, { messages });
}

export function addComment(
  chatId: string,
  messageId: string,
  text: string,
  client: QueryClient,
): void {
  const l = laeufe.get(chatId);
  if (!l) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  aendere(l, {
    messages: l.schnapp.messages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            comments: [
              ...(message.comments ?? []),
              {
                id: neueId(),
                text: trimmed,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : message,
    ),
  });
  sichern(chatId, l, client);
}

export function updateComment(
  chatId: string,
  messageId: string,
  commentId: string,
  text: string,
  client: QueryClient,
): void {
  const l = laeufe.get(chatId);
  if (!l) return;
  const trimmed = text.trim();
  if (!trimmed) {
    removeComment(chatId, messageId, commentId, client);
    return;
  }

  aendere(l, {
    messages: l.schnapp.messages.map((message) =>
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
  sichern(chatId, l, client);
}

export function removeComment(
  chatId: string,
  messageId: string,
  commentId: string,
  client: QueryClient,
): void {
  const l = laeufe.get(chatId);
  if (!l) return;

  aendere(l, {
    messages: l.schnapp.messages.map((message) =>
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
  sichern(chatId, l, client);
}

export function setzeVersteckt(
  chatId: string,
  messageId: string,
  versteckt: boolean,
  client: QueryClient,
): void {
  const l = laeufe.get(chatId);
  if (!l) return;

  aendere(l, {
    messages: l.schnapp.messages.map((message) =>
      message.id === messageId ? { ...message, hidden: versteckt } : message,
    ),
  });
  sichern(chatId, l, client);
}

export function setzeRueckgabe(
  chatId: string,
  handler: ((r: Rueckgabe) => void) | null,
): void {
  lauf(chatId).rueckgabe = handler;
}

export function fehlerWeg(chatId: string): void {
  const l = laeufe.get(chatId);
  if (l?.schnapp.error) aendere(l, { error: null });
}

export function stoppe(chatId: string): void {
  laeufe.get(chatId)?.controller?.abort();
}

export function laeuftGerade(chatId: string): boolean {
  return laeufe.get(chatId)?.schnapp.streaming ?? false;
}

function sichern(
  chatId: string,
  l: Lauf,
  client: QueryClient,
  { zwischenstand = false }: { zwischenstand?: boolean } = {},
): void {
  const inhalt = toStored(l.schnapp.messages);
  if (inhalt.length === 0) return;

  l.letzterHalt = performance.now();
  l.kette = l.kette
    .then(() => saveChat(chatId, { messages: inhalt, model: l.model }))
    .then((gespeichert) => {
      client.setQueryData(chatKeys.detail(chatId), {
        ...gespeichert,
        messages: fromStored(gespeichert.messages),
      });
      if (zwischenstand) return;
      return invalidateChatList(client);
    })
    .catch((fehler) => {
      console.error("Chat konnte nicht gespeichert werden:", fehler);
    });
}

const HALT_ABSTAND = 2000;

function merkeHalt(
  chatId: string,
  l: Lauf,
  client: QueryClient,
  sofort = false,
): void {
  if (!sofort && performance.now() - l.letzterHalt < HALT_ABSTAND) return;
  flush(l);
  sichern(chatId, l, client, { zwischenstand: true });
}

function flush(l: Lauf): void {
  l.frame = null;
  if (!l.dirty || !l.aktivId) return;
  l.dirty = false;

  const parts = l.parts.map((part) => ({ ...part }));
  const content = l.content;
  const id = l.aktivId;

  aendere(l, {
    messages: l.schnapp.messages.map((message) =>
      message.id === id ? { ...message, parts, content } : message,
    ),
  });
}

function plane(l: Lauf): void {
  if (l.frame !== null) return;
  l.frame = requestAnimationFrame(() => flush(l));
}

function haengeAn(l: Lauf, type: "content" | "reasoning", text: string): void {
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

export function starte({
  chatId,
  history,
  model,
  prompt,
  tools,
  voiceId,
  ttsModel,
  workspace,
  client,
}: TurnArgs): void {
  const l = lauf(chatId);
  if (l.schnapp.streaming) return;

  const id = neueId();
  l.aktivId = id;
  l.model = model;
  l.parts = [];
  l.content = "";
  l.tail = "";
  l.startedAt = performance.now();
  l.dirty = false;
  l.letzterHalt = 0;

  const controller = new AbortController();
  l.controller = controller;

  aendere(l, {
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

  sichern(chatId, l, client);

  void durchlauf(
    chatId,
    l,
    history,
    controller,
    { model, prompt, tools, voiceId, ttsModel, workspace },
    client,
  );
}

async function durchlauf(
  chatId: string,
  l: Lauf,
  history: ChatMessage[],
  controller: AbortController,
  optionen: {
    model: string | null;
    prompt: string | null;
    tools: boolean;
    voiceId: string;
    ttsModel: string | null;
    workspace: Workspace | null;
  },
  client: QueryClient,
): Promise<void> {
  let abgebrochen = false;
  let fehler: Error | null = null;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toWire(history, optionen.workspace),
        model: optionen.model ?? undefined,
        prompt: optionen.prompt ?? undefined,
        tools: optionen.tools,
        voice_id: optionen.voiceId || undefined,
        tts_model: optionen.ttsModel ?? undefined,
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

      let nahtstelle = false;

      if (frame.type === "content") {
        if (frame.delta.length > 0) {
          let delta = frame.delta;

          const last = l.parts.at(-1);
          const fortsetzung = last !== undefined && last.type !== "content";
          if (
            fortsetzung &&
            l.tail !== "" &&
            !/\s$/.test(l.tail) &&
            !/^\s/.test(delta)
          ) {
            delta = " " + delta;
          }

          haengeAn(l, "content", delta);
          l.content += delta;
          l.tail = delta.slice(-1);
        }
      } else if (frame.type === "reasoning") {
        if (frame.delta.length > 0) haengeAn(l, "reasoning", frame.delta);
      } else if (frame.type === "tool_call") {
        l.parts.push({
          type: "tool",
          callId: frame.call_id,
          tool: frame.tool,
          arguments: frame.arguments,
          status: "running",
        });
        nahtstelle = true;
      } else {
        const index = l.parts.findIndex(
          (part) => part.type === "tool" && part.callId === frame.call_id,
        );
        if (index !== -1) {
          const vorher = l.parts[index] as Extract<
            MessagePart,
            { type: "tool" }
          >;
          l.parts[index] = {
            ...vorher,
            status: frame.ok ? "ok" : "error",
            preview: frame.preview,
            length: frame.length,
          };
        }
        nahtstelle = true;
      }

      l.dirty = true;
      plane(l);
      merkeHalt(chatId, l, client, nahtstelle);
      nahtstelle = false;
    }
  } catch (ausnahme) {
    if (controller.signal.aborted) {
      abgebrochen = true;
    } else {
      fehler =
        ausnahme instanceof Error ? ausnahme : new Error("The turn failed.");
    }
  }

  beende(chatId, l, history, client, { abgebrochen, fehler });
}

function beende(
  chatId: string,
  l: Lauf,
  history: ChatMessage[],
  client: QueryClient,
  ergebnis: { abgebrochen: boolean; fehler: Error | null },
): void {
  l.controller = null;
  if (l.frame !== null) {
    cancelAnimationFrame(l.frame);
    l.frame = null;
  }
  l.dirty = true;
  flush(l);

  const id = l.aktivId;
  l.aktivId = null;
  if (!id) return;

  const durationMs = Math.round(performance.now() - l.startedAt);
  const { abgebrochen, fehler } = ergebnis;

  const nachricht = l.schnapp.messages.find((m) => m.id === id);
  const hatEtwas =
    (nachricht?.parts?.length ?? 0) > 0 ||
    (nachricht?.content.trim().length ?? 0) > 0;

  if ((fehler || abgebrochen) && !hatEtwas) {
    const letzte = history.at(-1);
    const ohnePlatzhalter = l.schnapp.messages.filter((m) => m.id !== id);

    aendere(l, {
      streaming: false,
      error: fehler,
      messages: abgebrochen ? ohnePlatzhalter.slice(0, -1) : ohnePlatzhalter,
    });

    if (abgebrochen && letzte?.role === "user") {
      l.rueckgabe?.({
        text: letzte.content,
        attachments: letzte.attachments ?? [],
      });
    }

    sichern(chatId, l, client);
    raeumeAufWennFrei(chatId, l);
    return;
  }

  aendere(l, {
    streaming: false,
    error: fehler,
    messages: l.schnapp.messages.map((message) =>
      message.id === id
        ? {
            ...message,
            streaming: false,
            aborted: abgebrochen,
            interrupted: fehler ? true : message.interrupted,
            durationMs,
          }
        : message,
    ),
  });

  sichern(chatId, l, client);
  raeumeAufWennFrei(chatId, l);
}

function raeumeAufWennFrei(chatId: string, l: Lauf): void {
  if (l.hoerer.size > 0) return;
  void l.kette.then(() => planeAufraeumen(chatId));
}
