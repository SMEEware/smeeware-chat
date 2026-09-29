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
  QueuedMessage,
  StreamFrame,
  WireMessage,
} from "@/lib/chat/types";
import { workspaceBlock } from "@/lib/workspaces/store";
import type { Workspace } from "@/lib/workspaces/store";

export type Rueckgabe = { text: string; attachments: Attachment[] };

export type Schnappschuss = {
  messages: ChatMessage[];
  streaming: boolean;
  error: Error | null;
  /** Waehrend des Turns nachgeschoben, vom Agenten noch nicht aufgenommen. */
  queued: QueuedMessage[];
};

type TurnOptionen = Omit<TurnArgs, "chatId" | "history">;

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

  /** Unter dieser id nimmt das Backend Einschuebe fuer den Turn an. */
  streamId: string | null;
  /** Womit der laufende Turn gestartet wurde -- fuer den Anschluss-Turn. */
  optionen: TurnOptionen | null;
};

const laeufe = new Map<string, Lauf>();

const KEINE_WARTENDEN: QueuedMessage[] = [];

const LEER: Schnappschuss = {
  messages: [],
  streaming: false,
  error: null,
  queued: KEINE_WARTENDEN,
};

/** Laenger als das geht keine Einzelnachricht zurueck ans Modell. */
const MAX_ZEICHEN = 60_000;
/** So viele Nachrichten reisen hoechstens mit -- die juengsten. */
const MAX_NACHRICHTEN = 120;

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Den Verlauf so aufbereiten, dass ihn jeder Anbieter annimmt -- auch nach
 * Stopps, Abbruechen und Fehlern.
 *
 * Frueher ging der Verlauf fast roh hinaus, und ein einziger schiefer Eintrag
 * machte den Chat fuer immer unbrauchbar: eine beim Denken gestoppte Antwort
 * ohne Text wurde mit 422 abgelehnt, jede weitere Frage schickte sie wieder
 * mit. Deshalb hier:
 *
 * - gestoppte und abgeschnittene Antworten tragen einen Vermerk -- das Modell
 *   soll wissen, dass es nicht zu Ende gesprochen hat,
 * - leere Nachrichten fallen weg, gleiche Rollen hintereinander werden eins,
 * - ueberlange Nachrichten werden in der Mitte gekuerzt,
 * - es reisen nur die juengsten Nachrichten, beginnend mit einer Frage.
 */
function toWire(
  alleMessages: ChatMessage[],
  workspace: Workspace | null = null,
): WireMessage[] {
  const messages = alleMessages.filter((m) => !m.hidden);

  const letzterNutzer = messages.map((m) => m.role).lastIndexOf("user");
  const wsBlock = workspaceBlock(workspace);

  const sauber: WireMessage[] = [];
  messages.forEach((message, index) => {
    let content: string;
    if (message.role === "assistant") {
      content = stripToolScaffolding(message.content).trim();
      if (message.aborted) {
        content = content
          ? `${content}\n\n[Stopped by the user before the answer was complete.]`
          : "[Stopped by the user before answering.]";
      } else if (message.interrupted) {
        // Auch ohne Text als Vermerk behalten: fiele die Antwort weg, wuerden
        // die Frage davor und die naechste zu einer verschmolzen -- und das
        // Modell beantwortete die abgebrochene statt der neuen.
        content = content
          ? `${content}\n\n[This answer was cut off.]`
          : "[This answer was cut off before any text arrived.]";
      }
    } else {
      const bloecke = [anhangBlock(message.attachments ?? [])];
      if (index === letzterNutzer && wsBlock) bloecke.push(wsBlock);
      const anhang = bloecke.filter(Boolean).join("\n\n");
      content = (
        anhang ? `${message.content}\n\n${anhang}` : message.content
      ).trim();
    }
    if (!content) return;

    const vorige = sauber.at(-1);
    if (vorige && vorige.role === message.role) {
      vorige.content = `${vorige.content}\n\n${content}`;
      return;
    }
    sauber.push({ role: message.role, content });
  });

  let fenster = sauber.slice(-MAX_NACHRICHTEN);
  while (fenster.length > 0 && fenster[0].role !== "user") {
    fenster = fenster.slice(1);
  }
  return fenster.map((m) => ({ ...m, content: kuerzen(m.content) }));
}

function letzteFrageImTelefonat(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].viaCall === true;
  }
  return false;
}

function kuerzen(text: string): string {
  if (text.length <= MAX_ZEICHEN) return text;
  const kopf = Math.floor(MAX_ZEICHEN * 0.7);
  const schwanz = MAX_ZEICHEN - kopf;
  const weg = text.length - MAX_ZEICHEN;
  return `${text.slice(0, kopf)}\n\n[… ${weg} characters omitted …]\n\n${text.slice(-schwanz)}`;
}

function neuerLauf(messages: ChatMessage[]): Lauf {
  return {
    schnapp: {
      messages,
      streaming: false,
      error: null,
      queued: KEINE_WARTENDEN,
    },
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
    streamId: null,
    optionen: null,
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

/**
 * Eine Nachricht in den laufenden Turn schieben -- wie in Claude.
 *
 * Der Agent nimmt sie an der naechsten Rundengrenze auf (nach den
 * Werkzeugergebnissen) und quittiert mit einem ``steer``-Frame; dann wandert
 * sie aus der Warteschlange in den Verlauf. Kommt keine Rundengrenze mehr,
 * geht sie nach dem Turn als eigene Frage hinaus. Liefert false, wenn gar
 * nichts laeuft -- dann ist es eine ganz normale neue Nachricht.
 */
export function schiebeEin(chatId: string, text: string): boolean {
  const l = laeufe.get(chatId);
  const sauber = text.trim();
  if (!l || !l.schnapp.streaming || !l.streamId || !sauber) return false;

  const eintrag: QueuedMessage = { id: neueId(), text: sauber };
  aendere(l, { queued: [...l.schnapp.queued, eintrag] });

  // Schlaegt das fehl (Turn gerade zu Ende, Netz weg), bleibt der Eintrag in
  // der Warteschlange und geht nach dem Turn als Frage hinaus -- verloren
  // geht er nicht.
  void fetch("/api/chat/steer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stream_id: l.streamId,
      id: eintrag.id,
      content: sauber,
    }),
  }).catch(() => {});
  return true;
}

/** Einen noch nicht aufgenommenen Einschub zuruecknehmen. */
export function zieheZurueck(chatId: string, id: string): void {
  const l = laeufe.get(chatId);
  if (!l) return;
  const rest = l.schnapp.queued.filter((q) => q.id !== id);
  if (rest.length === l.schnapp.queued.length) return;
  aendere(l, { queued: rest.length ? rest : KEINE_WARTENDEN });

  if (!l.streamId) return;
  const params = new URLSearchParams({ stream_id: l.streamId, id });
  void fetch(`/api/chat/steer?${params}`, { method: "DELETE" }).catch(
    () => {},
  );
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
}: TurnArgs): boolean {
  const l = lauf(chatId);
  if (l.schnapp.streaming) return false;

  const id = neueId();
  l.aktivId = id;
  l.model = model;
  l.streamId = neueId();
  l.optionen = { model, prompt, tools, voiceId, ttsModel, workspace, client };
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
  return true;
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
        stream_id: l.streamId ?? undefined,
        // Im Telefonat gesprochen: das Backend ergaenzt den System-Prompt um
        // Sprechregeln -- die Antwort wird vorgelesen, nicht gelesen.
        mode: letzteFrageImTelefonat(history) ? "call" : undefined,
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
      } else if (frame.type === "steer") {
        teileBeiEinschub(chatId, l, frame, client);
        continue;
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
    } else if (ausnahme instanceof TypeError) {
      // Der Browser meldet eine abgerissene Verbindung als nacktes
      // "network error" / "Failed to fetch" -- fuer den Nutzer nichtssagend.
      fehler = new Error(
        "The connection to the backend was lost. Try again.",
      );
    } else {
      fehler =
        ausnahme instanceof Error ? ausnahme : new Error("The turn failed.");
    }
  }

  beende(chatId, l, history, client, { abgebrochen, fehler });
}

/**
 * Der Agent hat einen Einschub aufgenommen. Die Antwort wird an genau dieser
 * Stelle geteilt: was bisher kam, ist fertig; dann steht die nachgeschobene
 * Nachricht als eigene Frage im Verlauf; der Rest des Turns laeuft in eine
 * neue Antwort. So liest sich der Verlauf danach wie ein normales Gespraech
 * -- und reist beim naechsten Turn auch genau so zum Modell.
 */
function teileBeiEinschub(
  chatId: string,
  l: Lauf,
  frame: Extract<StreamFrame, { type: "steer" }>,
  client: QueryClient,
): void {
  if (l.frame !== null) {
    cancelAnimationFrame(l.frame);
    l.frame = null;
  }
  l.dirty = true;
  flush(l);

  const bisher = l.aktivId;
  const neu = neueId();
  const jetzt = performance.now();
  const dauer = Math.round(jetzt - l.startedAt);

  l.aktivId = neu;
  l.parts = [];
  l.content = "";
  l.tail = "";
  l.startedAt = jetzt;

  const frage: ChatMessage = {
    id: frame.id,
    role: "user",
    content: frame.content,
  };
  const antwort: ChatMessage = {
    id: neu,
    role: "assistant",
    content: "",
    parts: [],
    streaming: true,
    model: l.model ?? undefined,
  };

  const rest = l.schnapp.queued.filter((q) => q.id !== frame.id);
  aendere(l, {
    queued: rest.length ? rest : KEINE_WARTENDEN,
    messages: [
      ...l.schnapp.messages.map((message) =>
        message.id === bisher
          ? { ...message, streaming: false, durationMs: dauer }
          : message,
      ),
      frage,
      antwort,
    ],
  });
  sichern(chatId, l, client, { zwischenstand: true });
}

function beende(
  chatId: string,
  l: Lauf,
  _history: ChatMessage[],
  client: QueryClient,
  ergebnis: { abgebrochen: boolean; fehler: Error | null },
): void {
  l.controller = null;
  if (l.frame !== null) {
    cancelAnimationFrame(l.frame);
    l.frame = null;
  }

  const { abgebrochen } = ergebnis;
  let { fehler } = ergebnis;

  // Ein Werkzeug, das beim Stopp oder Abriss noch lief, laeuft nicht weiter.
  // Stehen geblieben waere ein Kringel, der sich fuer immer dreht.
  if (abgebrochen || fehler) {
    l.parts = l.parts.map((part) =>
      part.type === "tool" && part.status === "running"
        ? {
            ...part,
            status: "error",
            preview: abgebrochen ? "Stopped before it finished." : "Interrupted.",
          }
        : part,
    );
  }
  l.dirty = true;
  flush(l);

  const id = l.aktivId;
  l.aktivId = null;
  const optionen = l.optionen;
  l.streamId = null;
  if (!id) return;

  const durationMs = Math.round(performance.now() - l.startedAt);

  const nachricht = l.schnapp.messages.find((m) => m.id === id);
  const hatEtwas =
    (nachricht?.parts?.length ?? 0) > 0 ||
    (nachricht?.content.trim().length ?? 0) > 0;

  // Sauber zu Ende, aber nichts gesagt: fuer den Nutzer sieht das aus wie ein
  // Haenger. Lieber ein Fehler mit "Try again" als eine leere Blase.
  if (!fehler && !abgebrochen && !hatEtwas) {
    fehler = new Error("The model returned an empty answer. Try again.");
  }

  // Was noch in der Warteschlange steht, wurde nicht aufgenommen.
  const wartend = l.schnapp.queued;

  if ((fehler || abgebrochen) && !hatEtwas) {
    const ohnePlatzhalter = l.schnapp.messages.filter((m) => m.id !== id);
    const letzte = ohnePlatzhalter.at(-1);
    const frageZurueck = abgebrochen && letzte?.role === "user";

    aendere(l, {
      streaming: false,
      error: fehler,
      queued: KEINE_WARTENDEN,
      messages: frageZurueck ? ohnePlatzhalter.slice(0, -1) : ohnePlatzhalter,
    });

    const texte = [
      ...(frageZurueck && letzte ? [letzte.content] : []),
      ...wartend.map((q) => q.text),
    ];
    if (texte.length > 0) {
      l.rueckgabe?.({
        text: texte.join("\n\n"),
        attachments: frageZurueck ? (letzte?.attachments ?? []) : [],
      });
    }

    sichern(chatId, l, client);
    raeumeAufWennFrei(chatId, l);
    return;
  }

  aendere(l, {
    streaming: false,
    error: fehler,
    queued: KEINE_WARTENDEN,
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

  if (wartend.length > 0) {
    // Sauber zu Ende: die nicht aufgenommenen Einschuebe gehen als naechste
    // Frage hinaus -- der Nutzer hat sie ja abgeschickt. Nach einem Stopp
    // oder Fehler dagegen zurueck ins Feld: da soll er selbst entscheiden.
    if (!fehler && !abgebrochen && optionen) {
      starte({
        ...optionen,
        chatId,
        history: [
          ...l.schnapp.messages,
          {
            id: wartend[0].id,
            role: "user",
            content: wartend.map((q) => q.text).join("\n\n"),
          },
        ],
      });
      return;
    }
    l.rueckgabe?.({
      text: wartend.map((q) => q.text).join("\n\n"),
      attachments: [],
    });
  }

  raeumeAufWennFrei(chatId, l);
}

function raeumeAufWennFrei(chatId: string, l: Lauf): void {
  if (l.hoerer.size > 0) return;
  void l.kette.then(() => planeAufraeumen(chatId));
}
