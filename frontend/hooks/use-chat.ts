"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  abonniere,
  fehlerWeg,
  schnappschuss,
  serverSchnappschuss,
  setzeVerlauf,
  setzeRueckgabe,
  starte,
  stoppe,
} from "@/lib/chat/turn-runner";
import type { Attachment, ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { aktiverWorkspace, useWorkspaces } from "@/lib/workspaces/store";

type UseChatOptions = {
  /** Unter dieser id liegt der Chat in der Ablage -- immer die aus der
   *  Route. Geschrieben wird erst mit der ersten Frage. */
  chatId: string;
  /** Verlauf aus der Ablage. Wird nur beim Einhaengen gelesen -- danach
   *  fuehrt der Lauf den Verlauf allein weiter. */
  initialMessages?: ChatMessage[];
};

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Die Chat-Ansicht -- ein Fenster auf einen Lauf, nicht sein Besitzer.
 *
 * Der eigentliche Turn liegt in ``turn-runner`` und damit ausserhalb von
 * React. Dieser Hook meldet sich nur an: er liest den Stand und schickt
 * Befehle hin. Deshalb ueberlebt eine laufende Antwort den Wechsel des
 * Chats -- frueher haengte sie am Effekt-Cleanup dieser Komponente und
 * starb mit ihr, samt allem, was noch nicht gespeichert war.
 *
 * Eingabefeld und Anhaenge bleiben lokal: sie gehoeren zur Ansicht, nicht
 * zum Turn.
 */
export function useChat({ chatId, initialMessages }: UseChatOptions) {
  const queryClient = useQueryClient();
  const einstellungen = useSettings();
  const workspace = useWorkspaces(aktiverWorkspace);

  const [input, setInput] = React.useState("");
  // Neben dem Eingabefeld und aus demselben Grund: bricht man den Turn ab,
  // kommen Frage UND Dateien zurueck, statt dass ein Upload still verfaellt.
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);

  // Den geladenen Verlauf einhaengen -- aber nur, wenn dort nicht schon
  // etwas laeuft. Kommt jemand zu einem arbeitenden Chat zurueck, gilt der
  // Stand des Laufs, nicht der aeltere aus der Ablage.
  //
  // Der geladene Verlauf wird einmal eingehaengt und als Saat festgehalten.
  //
  // Als useState-Initialisierer und nicht als Effekt: der Schnappschuss
  // unten muss schon im ersten Render stimmen, sonst blitzt ein leerer
  // Verlauf auf, bevor der geladene ankommt. Und der festgehaltene Wert
  // bleibt stabil -- gaebe man ``initialMessages`` direkt weiter, wechselte
  // dessen Identitaet nach jedem Speichern und die Anmeldung liefe jedes
  // Mal neu.
  const [saat] = React.useState(() => {
    if (initialMessages?.length) setzeVerlauf(chatId, initialMessages);
    return initialMessages;
  });

  const abonnieren = React.useCallback(
    (hoerer: () => void) => abonniere(chatId, hoerer, saat),
    [chatId, saat],
  );
  const lesen = React.useCallback(() => schnappschuss(chatId), [chatId]);

  const stand = React.useSyncExternalStore(
    abonnieren,
    lesen,
    serverSchnappschuss,
  );

  // Eine abgebrochene Frage kommt zurueck ins Feld -- nur die Ansicht hat
  // eines. Der Lauf ruft hier an, statt es in den Schnappschuss zu legen.
  React.useEffect(() => {
    setzeRueckgabe(chatId, (rueckgabe) => {
      setInput(rueckgabe.text);
      if (rueckgabe.attachments.length > 0) {
        setAttachments(rueckgabe.attachments);
      }
    });
    return () => setzeRueckgabe(chatId, null);
  }, [chatId]);

  const send = React.useCallback(
    (text: string, model: string | null = null) => {
      const sauber = text.trim();
      if (!sauber || stand.streaming) return;

      setInput("");
      const angehaengt = attachments;
      setAttachments([]);

      starte({
        chatId,
        history: [
          ...stand.messages,
          {
            id: neueId(),
            role: "user",
            content: sauber,
            attachments: angehaengt.length > 0 ? angehaengt : undefined,
          },
        ],
        model,
        prompt: einstellungen.prompt,
        tools: einstellungen.tools,
        voiceId: einstellungen.voiceId,
        ttsModel: einstellungen.ttsModel,
        workspace,
        client: queryClient,
      });
    },
    [
      attachments,
      chatId,
      einstellungen.prompt,
      einstellungen.tools,
      einstellungen.voiceId,
      einstellungen.ttsModel,
      workspace,
      queryClient,
      stand.messages,
      stand.streaming,
    ],
  );

  /** Letzte Frage erneut stellen -- nach Fehler oder fuer eine neue Antwort. */
  const retry = React.useCallback(
    (model: string | null = null) => {
      if (stand.streaming) return;

      let history = stand.messages;
      while (history.at(-1)?.role === "assistant") history = history.slice(0, -1);
      if (history.at(-1)?.role !== "user") return;

      starte({
        chatId,
        history,
        model,
        prompt: einstellungen.prompt,
        tools: einstellungen.tools,
        voiceId: einstellungen.voiceId,
        ttsModel: einstellungen.ttsModel,
        workspace,
        client: queryClient,
      });
    },
    [
      chatId,
      einstellungen.prompt,
      einstellungen.tools,
      einstellungen.voiceId,
      einstellungen.ttsModel,
      workspace,
      queryClient,
      stand.messages,
      stand.streaming,
    ],
  );

  const stop = React.useCallback(() => stoppe(chatId), [chatId]);
  const dismissError = React.useCallback(() => fehlerWeg(chatId), [chatId]);

  // Erreichbarkeit des Backends -- fuellt den Punkt im Header.
  const health = useQuery({
    queryKey: ["backend", "health"],
    queryFn: async () => {
      const response = await fetch("/api/chat", { cache: "no-store" });
      return (await response.json()) as {
        online: boolean;
        endpoint: string;
        latencyMs: number | null;
      };
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: false,
  });

  return {
    chatId,
    messages: stand.messages,
    input,
    setInput,
    attachments,
    setAttachments,
    send,
    retry,
    stop,
    isStreaming: stand.streaming,
    error: stand.error,
    dismissError,
    health,
  };
}
