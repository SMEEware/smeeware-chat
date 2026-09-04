/**
 * Der Zugriff auf die gespeicherten Chats -- eine Schicht ueber /api/chats.
 *
 * Die Routen unter app/api/chats reichen nur weiter; hier steht, wie eine
 * Antwort aussieht und was ein Fehler bedeutet. Die Hooks darueber kennen
 * damit weder URLs noch Statuscodes.
 */

import type {
  ChatDetail,
  ChatListResponse,
  ChatMessage,
  ChatSummary,
} from "@/lib/chat/types";

const BASE = "/api/chats";

/**
 * Es gibt den Chat nicht (mehr). Eigener Typ, weil der Aufrufer daraus
 * zwei verschiedene Dinge liest: bei einer gerade erst gezogenen id ist
 * das der Normalfall (ein neuer Chat wird erst beim Senden geschrieben),
 * bei einem Link auf einen geloeschten Chat der Fehlerfall.
 */
export class ChatNotFound extends Error {
  constructor(id: string) {
    super(`No stored chat for ${id}.`);
    this.name = "ChatNotFound";
  }
}

/**
 * Die Sitzung gilt nicht mehr.
 *
 * Eigener Typ, weil das etwas anderes ist als ein kaputter Abruf: der
 * Datenschluessel der Chats lebt nur im Speicher des Backends. Startet es
 * neu -- und im Betrieb mit ``--reload`` tut es das bei jeder Dateiaenderung
 * --, ist jede Sitzung weg, waehrend das Cookie im Browser weiterlebt. Ohne
 * eigenen Typ landet das im selben Zweig wie "Chat existiert nicht" und die
 * Ansicht behauptet, der Verlauf sei geloescht.
 */
export class NotAuthenticated extends Error {
  constructor(message = "Your session has expired.") {
    super(message);
    this.name = "NotAuthenticated";
  }
}

/** Fehlermeldung aus der Antwort ziehen -- sonst bleibt nur der Status. */
async function fehler(response: Response): Promise<never> {
  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    message = payload?.error?.message ?? message;
  } catch {
    // Kein JSON -- der Status muss reichen.
  }
  if (response.status === 401) throw new NotAuthenticated(message);
  throw new Error(message);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) await fehler(response);
  return (await response.json()) as T;
}

export async function fetchChats(signal?: AbortSignal): Promise<ChatSummary[]> {
  const response = await fetch(`${BASE}?limit=200`, {
    cache: "no-store",
    signal,
  });
  return (await json<ChatListResponse>(response)).chats ?? [];
}

export async function fetchChat(
  id: string,
  signal?: AbortSignal,
): Promise<ChatDetail> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 404) throw new ChatNotFound(id);

  const detail = await json<ChatDetail>(response);
  return { ...detail, messages: fromStored(detail.messages) };
}

/**
 * Legt an oder ueberschreibt -- PUT ist ein Upsert, die id kommt aus dem
 * Client. Ein Wiederholungsversuch ist deshalb gefahrlos.
 */
export async function saveChat(
  id: string,
  body: { messages: ChatMessage[]; model?: string | null; title?: string },
): Promise<ChatDetail> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: toStored(body.messages),
      model: body.model ?? undefined,
      title: body.title,
    }),
  });
  return json<ChatDetail>(response);
}

export async function renameChat(
  id: string,
  title: string,
): Promise<ChatDetail> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return json<ChatDetail>(response);
}

export async function deleteChat(id: string): Promise<void> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) await fehler(response);
}

/**
 * Einen Chat oeffentlich lesbar machen -- oder das zuruecknehmen.
 *
 * Das Backend legt beim Teilen eine zweite, mit dem App-Schluessel
 * verschluesselte Kopie an; sie ist es, die Unangemeldete zu sehen bekommen.
 * Zuruecknehmen loescht diese Kopie, der Chat selbst bleibt.
 */
export async function setChatPublic(
  id: string,
  oeffentlich: boolean,
): Promise<void> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}/share`, {
    method: oeffentlich ? "POST" : "DELETE",
  });
  if (!response.ok) await fehler(response);
}

/** Ein geteilter Verlauf -- ohne Anmeldung. */
export async function fetchPublicChat(
  id: string,
  signal?: AbortSignal,
): Promise<ChatDetail> {
  const response = await fetch(`/api/public/chats/${encodeURIComponent(id)}`, {
    signal,
    cache: "no-store",
  });
  if (response.status === 404) throw new ChatNotFound(id);
  if (!response.ok) await fehler(response);
  return (await response.json()) as ChatDetail;
}

/** Leert die ganze Ablage und meldet, wie viele Chats verschwunden sind. */
export async function deleteAllChats(): Promise<number> {
  const response = await fetch(BASE, { method: "DELETE" });
  if (!response.ok) await fehler(response);
  const nutzlast = (await response.json()) as { deleted?: number };
  return nutzlast.deleted ?? 0;
}

/**
 * Was in die Ablage geht: alles ausser den Zustaenden, die nur waehrend
 * eines Turns gelten. ``streaming`` wuerde beim Neuladen eine Nachricht
 * zeigen, die auf einen Strom wartet, den es nicht mehr gibt.
 *
 * An seine Stelle tritt ``interrupted``. Eine Nachricht, die beim Speichern
 * noch laeuft, ist ein Zwischenstand: geht der Browser jetzt verloren --
 * neu geladen, Sitzung abgelaufen, Tab zu --, kommt der Rest nie an. Das
 * gehoert in die Ablage, sonst gibt die Ansicht spaeter einen abgebrochenen
 * Turn als fertige Antwort aus.
 *
 * Abgeleitet und nicht durchgereicht: es gibt genau eine Stelle, an der
 * entschieden wird, ob eine gespeicherte Antwort vollstaendig ist -- diese
 * hier. Ein Flag, das der Aufrufer setzt, waere eines, das er vergisst.
 *
 * Leere Nachrichten fliegen raus -- eine abgebrochene Antwort ohne ein
 * einziges Zeichen ist nichts, was man wiedersehen will.
 */
export function toStored(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(
      (message) =>
        message.content.trim().length > 0 || (message.parts?.length ?? 0) > 0,
    )
    .map((message) => {
      const kopie: ChatMessage = { ...message };
      // ``|| message.interrupted`` macht die Funktion idempotent, und das
      // ist keine Vorsicht auf Vorrat: sie laeuft zweimal ueber dieselben
      // Nachrichten -- einmal beim Zusammenstellen, einmal in ``saveChat``.
      // Ohne diesen Zweig loescht der zweite Durchlauf, was der erste
      // gesetzt hat, weil ``streaming`` da schon weg ist.
      if (message.streaming || message.interrupted) kopie.interrupted = true;
      else delete kopie.interrupted;
      delete kopie.streaming;
      return kopie;
    });
}

/**
 * Gegenrichtung: was aus der Ablage kommt, wird wieder zu Nachrichten des
 * Verlaufs. Eine fehlende id waere fatal -- der Verlauf schluesselt danach.
 */
export function fromStored(messages: ChatMessage[] | undefined): ChatMessage[] {
  return (messages ?? []).map((message, index) => ({
    ...message,
    id: message.id ?? `gespeichert-${index}`,
    streaming: false,
  }));
}

/**
 * Ein Chat, den es nur im Browser gibt. Wandert in den Cache, wenn jemand
 * "New chat" drueckt -- so oeffnet die Ansicht sofort, statt erst gegen
 * ein 404 zu laufen.
 */
export function leererChat(id: string): ChatDetail {
  const jetzt = new Date().toISOString();
  return {
    id,
    title: "New chat",
    model: null,
    message_count: 0,
    created_at: jetzt,
    updated_at: jetzt,
    messages: [],
  };
}

/** Eine frische Chat-id. Erfuellt die Pruefung des Backends (A-Za-z0-9_-). */
export function newChatId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
