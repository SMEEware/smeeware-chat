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

/**
 * Laufende Turns -- ausserhalb von React.
 *
 * Vorher lag der Turn im Hook der Chat-Ansicht: der Abbruch hing am
 * Cleanup des Effekts, das Speichern an einem Effekt auf ``messages``.
 * Ein Wechsel des Chats hat damit beides zerstoert -- der Stream wurde
 * abgebrochen, und selbst was schon angekommen war, kam nie in die Ablage,
 * weil der Effekt, der speichert, mit der Komponente verschwand.
 *
 * Hier laeuft der Turn in einem Modul-Speicher weiter, an dem sich Ansichten
 * nur an- und abmelden. Wer wegnavigiert, unterbricht nichts; wer
 * zurueckkommt, sieht den Strom da, wo er inzwischen steht. Gespeichert
 * wird vom Lauf selbst, nicht von der Ansicht.
 *
 * Ein Lauf je Chat-id, mehrere Chats duerfen gleichzeitig arbeiten.
 */

export type Rueckgabe = { text: string; attachments: Attachment[] };

export type Schnappschuss = {
  messages: ChatMessage[];
  streaming: boolean;
  error: Error | null;
};

type Lauf = {
  schnapp: Schnappschuss;
  hoerer: Set<() => void>;
  /** Laeuft, wenn niemand mehr zusieht -- siehe planeAufraeumen. */
  aufraeumen: ReturnType<typeof setTimeout> | null;
  /** Wohin eine abgebrochene Frage zurueckgeht. Nur gesetzt, solange eine
   *  Ansicht haengt -- abbrechen kann ohnehin nur, wer eine sieht. */
  rueckgabe: ((r: Rueckgabe) => void) | null;
  controller: AbortController | null;
  /** Schreibvorgaenge laufen hintereinander, nie parallel. */
  kette: Promise<unknown>;
  model: string | null;

  // Der Strom tropft zeichenweise herein. Aufgebaut wird hier, in den
  // Schnappschuss geschrieben nur einmal pro Bild.
  parts: MessagePart[];
  content: string;
  tail: string;
  aktivId: string | null;
  startedAt: number;
  dirty: boolean;
  frame: number | null;
  /** Wann zuletzt ein Zwischenstand in die Ablage ging. */
  letzterHalt: number;
};

const laeufe = new Map<string, Lauf>();

/** Stabile Referenz fuer das Rendern auf dem Server. */
const LEER: Schnappschuss = {
  messages: [],
  streaming: false,
  error: null,
};

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Nur role und content -- der Gedankengang bleibt im Client.
 *
 * Hier entsteht auch der Datei-Block: erst auf dem Weg zur Leitung, nicht
 * im Verlauf. So steht in der Blase weiter die Frage, die getippt wurde,
 * und das Backend braucht trotzdem kein Feld ausser ``content``.
 */
function toWire(
  alleMessages: ChatMessage[],
  workspace: Workspace | null = null,
): WireMessage[] {
  // Versteckte Nachrichten fallen VOR allem anderen heraus. Die Reihenfolge
  // ist nicht beliebig: ``letzterNutzer`` unten ist ein Index in genau dieses
  // Array. Wuerde erst spaeter gefiltert, zeigte er auf eine Position im
  // ungefilterten Verlauf und der Workspace-Block landete an der falschen
  // Nachricht -- oder an einer, die gar nicht mitreist.
  const messages = alleMessages.filter((m) => !m.hidden);

  // Der Workspace-Block reist nur an der LETZTEN Nutzernachricht mit -- so
  // sieht das Modell immer den gerade aktiven Kontext, ohne ihn in jeder
  // Zeile zu wiederholen. Der Index wird vorab gesucht, damit die Karte
  // ihn beim Durchlaufen wiedererkennt.
  const letzterNutzer = messages.map((m) => m.role).lastIndexOf("user");
  const wsBlock = workspaceBlock(workspace);

  return messages.map(({ role, content, attachments }, index) => {
    // Nur Assistenz-Antworten saeubern -- Nutzertext bleibt unangetastet,
    // damit ein bewusst getippter Aufruf nicht aus dem Verlauf faellt.
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

/** Neuer Schnappschuss + alle Zuhoerer wecken. */
function aendere(l: Lauf, teil: Partial<Schnappschuss>): void {
  l.schnapp = { ...l.schnapp, ...teil };
  for (const hoerer of l.hoerer) hoerer();
}

// ------------------------------------------------------------------ //
// Anbinden                                                            //
// ------------------------------------------------------------------ //

export function schnappschuss(chatId: string): Schnappschuss {
  return laeufe.get(chatId)?.schnapp ?? LEER;
}

export function serverSchnappschuss(): Schnappschuss {
  return LEER;
}

/**
 * Wie lange ein Lauf ohne Zuhoerer noch stehen bleibt.
 *
 * Nicht bloss ein Kniff gegen StrictMode -- der braeuchte nur einen Tick.
 * Diese Spanne ist auch die Antwort auf schnelles Hin- und Herklicken: wer
 * zwei Chats vergleicht, soll nicht jedes Mal auf einen Ladevorgang warten.
 */
const VERWEILDAUER = 30_000;

/**
 * An- und abmelden.
 *
 * Weggeraeumt wird verzoegert und nie im Cleanup selbst. Der Grund ist
 * StrictMode: React haengt Effekte im Entwicklungsmodus zweimal ein --
 * anmelden, abmelden, anmelden. Ein sofortiges Loeschen im Cleanup wirft
 * dabei den gerade eingehaengten Verlauf weg, und weil der
 * useState-Initialisierer beim zweiten Mal nicht noch einmal laeuft, kommt
 * er nie wieder. Ein arbeitender Chat ueberlebte das nur, weil er
 * ``streaming`` trug -- alle anderen standen danach leer da.
 */
export function abonniere(
  chatId: string,
  hoerer: () => void,
  /** Der geladene Verlauf -- als Saat, falls es den Eintrag nicht gibt. */
  initial?: ChatMessage[],
): () => void {
  // Auch hier saeen und nicht nur beim ersten Render: waere der Eintrag
  // zwischendurch weggeraeumt worden, entstuende hier sonst ein leerer --
  // und der Verlauf kaeme nie wieder, weil der Initialisierer der Ansicht
  // nur ein einziges Mal laeuft.
  const l = lauf(chatId, initial);
  l.hoerer.add(hoerer);

  // Jemand sieht wieder zu: ein vorgemerktes Aufraeumen ist hinfaellig.
  if (l.aufraeumen !== null) {
    clearTimeout(l.aufraeumen);
    l.aufraeumen = null;
  }

  return () => {
    // Frisch nachschlagen statt ``l`` zu verwenden: der Eintrag koennte
    // inzwischen ein anderer sein, und dann wuerde hier der falsche
    // aufgeraeumt.
    const aktuell = laeufe.get(chatId);
    if (!aktuell) return;
    aktuell.hoerer.delete(hoerer);
    planeAufraeumen(chatId);
  };
}

/** Nach der Verweildauer weg -- falls bis dahin niemand zurueckkommt. */
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

/** Den Verlauf beim Einhaengen setzen -- nur, wenn nichts laeuft. */
export function setzeVerlauf(chatId: string, messages: ChatMessage[]): void {
  const l = lauf(chatId, messages);
  if (l.schnapp.streaming || l.schnapp.messages.length > 0) return;
  aendere(l, { messages });
}

/**
 * Attach a note to a message.
 *
 * Goes through ``aendere`` and ``sichern`` -- the same path as a turn, so
 * the store stays consistent and a reload finds the comments again. Empty
 * text is discarded.
 */
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

/** Edit the text of a note in place. Empty text removes it instead. */
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

/** Remove a single note again. */
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

/**
 * Eine Nachricht aus dem Verlauf nehmen -- oder zurueckholen.
 *
 * Derselbe Weg wie die Notizen: ueber ``aendere`` und ``sichern``, damit ein
 * Neuladen den Zustand wiederfindet. Die Nachricht bleibt vollstaendig
 * erhalten, sie traegt nur ein Feld mehr; entfernt wird sie erst auf dem Weg
 * zum Modell in ``toWire``.
 */
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

/**
 * Wohin eine abgebrochene Frage zurueckgehen soll.
 *
 * Als Rueckruf und nicht als Feld im Schnappschuss: das Zurueckgeben ist
 * ein Ereignis, kein Zustand. Als Zustand muesste die Ansicht es in einem
 * Effekt abholen und wieder quittieren -- zwei Renderrunden fuer etwas,
 * das genau einmal passiert.
 */
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

// ------------------------------------------------------------------ //
// Ablage                                                              //
// ------------------------------------------------------------------ //

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
      // Den Verlauf im Cache mitziehen. Ohne das bliebe der Eintrag auf dem
      // Stand vom Oeffnen stehen -- bei einem neuen Chat also leer, und wer
      // wegnavigiert und zurueckkommt, faende ihn leer vor.
      client.setQueryData(chatKeys.detail(chatId), {
        ...gespeichert,
        messages: fromStored(gespeichert.messages),
      });
      // Die Liste nur am Ende auffrischen: Titel und Reihenfolge aendern
      // sich waehrend eines Turns nicht, und bei einer Bilderzeugung waeren
      // das ein Dutzend Abrufe ohne Anlass.
      if (zwischenstand) return;
      return invalidateChatList(client);
    })
    .catch((fehler) => {
      // Ein misslungenes Sichern darf den Chat nicht stoeren: der Verlauf
      // laeuft im Speicher weiter, nur die Liste bleibt alt.
      console.error("Chat konnte nicht gespeichert werden:", fehler);
    });
}

/**
 * Wie oft ein laufender Turn einen Zwischenstand ablegt.
 *
 * Der Grund fuer diese Zwischenstaende: bis hierher wurde ein Turn genau
 * zweimal gespeichert -- die Frage beim Absenden und die Antwort am Ende.
 * Dazwischen lebte alles nur im Speicher des Browsers. Ein Neuladen, eine
 * abgelaufene Sitzung oder ein geschlossener Tab warf deshalb alles weg,
 * was schon angekommen war, und der Chat endete fuer immer mit einer Frage
 * ohne Antwort -- waehrend das Backend weiterrechnete und bezahlt wurde.
 *
 * Bei einer Antwort von zehn Sekunden faellt das kaum auf. Eine
 * Bilderzeugung laeuft zwei Minuten, und genau darin liegt der Unterschied
 * zwischen "selten aergerlich" und "regelmaessig weg".
 *
 * Zwei Sekunden sind der Kompromiss: haeufig genug, dass nie viel fehlt,
 * selten genug, dass ein schnell tippendes Modell die Ablage nicht mit
 * Schreibvorgaengen zupflastert.
 */
const HALT_ABSTAND = 2000;

/**
 * Einen Zwischenstand ablegen -- gedrosselt, ausser bei ``sofort``.
 *
 * ``sofort`` gilt an den Nahtstellen eines Turns: ein Werkzeug beginnt oder
 * endet. Die sind selten und markieren echten Fortschritt; sie an der
 * Drossel scheitern zu lassen hiesse, den einen Moment zu verpassen, auf
 * den es ankommt.
 */
function merkeHalt(
  chatId: string,
  l: Lauf,
  client: QueryClient,
  sofort = false,
): void {
  if (!sofort && performance.now() - l.letzterHalt < HALT_ABSTAND) return;
  // Der Schnappschuss haengt sonst bis zum naechsten Bild hinterher --
  // gespeichert wuerde dann der Stand von davor.
  flush(l);
  sichern(chatId, l, client, { zwischenstand: true });
}

// ------------------------------------------------------------------ //
// Der Turn                                                            //
// ------------------------------------------------------------------ //

function flush(l: Lauf): void {
  l.frame = null;
  if (!l.dirty || !l.aktivId) return;
  l.dirty = false;

  // Flache Kopien, damit geaenderte Abschnitte neue Referenzen bekommen.
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

/**
 * Delta an den letzten Abschnitt haengen, wenn er denselben Typ hat --
 * sonst einen neuen oeffnen. Der Wechsel des Typs ist genau die Naht, an
 * der spaeter die Pause im Verlauf erscheint.
 */
function haengeAn(l: Lauf, type: "content" | "reasoning", text: string): void {
  const last = l.parts[l.parts.length - 1];
  // An einen Werkzeug-Part wird nie angehaengt -- der oeffnet immer neu.
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
  /** Der aktive Workspace -- reist als Kontext an der letzten Frage mit. */
  workspace: Workspace | null;
  client: QueryClient;
};

/** Einen Turn starten. Laeuft weiter, auch wenn die Ansicht verschwindet. */
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
      // Modell an der Antwort festhalten -- so bleibt sichtbar, welches
      // Modell sie erzeugt hat, auch wenn man mitten im Chat wechselt.
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

  // Die Frage soll sofort in der Ablage stehen -- faellt der Browser
  // waehrend der Antwort aus, ist sie trotzdem da.
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
        // Der Prompt bestimmt die Persona, der Schalter, ob das Modell
        // ueberhaupt Werkzeuge angeboten bekommt.
        prompt: optionen.prompt ?? undefined,
        tools: optionen.tools,
        // Fuers Vorlesen: welche Stimme, welches Sprach-Modell. Leer
        // heisst "nimm die Vorgabe der .env".
        voice_id: optionen.voiceId || undefined,
        tts_model: optionen.ttsModel ?? undefined,
      }),
      signal: controller.signal,
    });

    // Fehler VOR dem ersten Byte -> ganz normaler HTTP-Status.
    if (!response.ok || !response.body) {
      throw new Error(await readErrorMessage(response));
    }

    for await (const frame of parseSseStream(
      response.body,
      controller.signal,
    )) {
      // Fehler NACH dem ersten Byte -> kommt als Frame rein.
      if (frame.type === "error") throw new Error(frame.error.message);

      // Markiert die Nahtstellen eines Werkzeugs -- sie umgehen unten die
      // Drossel des Zwischenstands.
      let nahtstelle = false;

      if (frame.type === "content") {
        if (frame.delta.length > 0) {
          let delta = frame.delta;

          // Beginnt hier ein neuer Content-Abschnitt nach einer Pause
          // (Denken oder Werkzeug)? Dann fehlt oft das trennende Leerzeichen
          // und die Segmente stossen als "Burp:Ah" aneinander. Nur
          // eingreifen, wenn schon Text da war und keine Seite selbst eins
          // mitbringt -- ein Doppelpunkt in "http://" laeuft ohne Pause
          // durch.
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
        // Neuer Werkzeugaufruf -- laeuft, bis das tool_result kommt.
        l.parts.push({
          type: "tool",
          callId: frame.call_id,
          tool: frame.tool,
          arguments: frame.arguments,
          status: "running",
        });
        // Sofort ablegen: gleich danach faengt ein Werkzeug an zu arbeiten,
        // und bei einem Bild sind das zwei Minuten, in denen sonst nichts
        // in die Ablage ginge.
        nahtstelle = true;
      } else {
        // tool_result: den passenden Aufruf ueber call_id finden und
        // abschliessen. Nicht ueber die Reihenfolge -- mehrere Werkzeuge
        // koennen parallel laufen.
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
      // Der Zwischenstand geht in die Ablage, damit ein Neuladen nicht
      // alles wegwirft, was schon da ist. Gedrosselt -- ausser an den
      // Nahtstellen eines Werkzeugs.
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

  // Kam ueberhaupt etwas an? Nicht ``hatteInhalt`` fragen -- das zaehlt nur
  // sichtbaren Text. Eine Bilderzeugung besteht zwei Minuten lang aus
  // Gedankengang und einem laufenden Werkzeug und hat trotzdem noch kein
  // einziges Zeichen Text. Frueher fiel genau das unter "nichts angekommen"
  // und wurde beim kleinsten Fehler geloescht -- samt dem Zwischenstand in
  // der Ablage, den der Turn schon abgelegt hatte.
  const nachricht = l.schnapp.messages.find((m) => m.id === id);
  const hatEtwas =
    (nachricht?.parts?.length ?? 0) > 0 ||
    (nachricht?.content.trim().length ?? 0) > 0;

  // Abbruch oder Fehler, ohne dass irgendetwas ankam: die leere Antwort
  // wieder rausnehmen, damit der Verlauf nicht mit einer offenen Nachricht
  // endet -- und die Frage zurueck ins Eingabefeld.
  if ((fehler || abgebrochen) && !hatEtwas) {
    const letzte = history.at(-1);
    const ohnePlatzhalter = l.schnapp.messages.filter((m) => m.id !== id);

    aendere(l, {
      streaming: false,
      error: fehler,
      // Bei einem Fehler bleibt die Frage stehen, damit "Nochmal versuchen"
      // etwas zum Wiederholen hat.
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
    // Der Fehler bleibt sichtbar, auch wenn die halbe Antwort steht: sonst
    // sieht es aus, als waere sie fertig, und niemand kaeme auf "nochmal".
    error: fehler,
    messages: l.schnapp.messages.map((message) =>
      message.id === id
        ? {
            ...message,
            streaming: false,
            aborted: abgebrochen,
            // Mittendrin abgerissen -- das, was steht, ist nicht die ganze
            // Antwort. Das gehoert an die Nachricht und nicht bloss in eine
            // Warnung daneben, die beim naechsten Laden weg ist.
            interrupted: fehler ? true : message.interrupted,
            durationMs,
          }
        : message,
    ),
  });

  sichern(chatId, l, client);
  raeumeAufWennFrei(chatId, l);
}

/**
 * Ein fertiger Lauf ohne Zuhoerer wird vorgemerkt -- aber erst, nachdem
 * gespeichert wurde. Sonst faende ein Rueckkehrer den Chat auf dem Stand
 * von vor dem Turn.
 */
function raeumeAufWennFrei(chatId: string, l: Lauf): void {
  if (l.hoerer.size > 0) return;
  void l.kette.then(() => planeAufraeumen(chatId));
}
