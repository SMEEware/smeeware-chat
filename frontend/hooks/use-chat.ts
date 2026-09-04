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
  setzeVersteckt,
  starte,
  stoppe,
} from "@/lib/chat/turn-runner";
import type { Attachment, ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { aktiverWorkspace, useWorkspaces } from "@/lib/workspaces/store";

type UseChatOptions = {
  chatId: string;
  initialMessages?: ChatMessage[];
};

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useChat({ chatId, initialMessages }: UseChatOptions) {
  const queryClient = useQueryClient();
  const einstellungen = useSettings();
  const workspace = useWorkspaces(aktiverWorkspace);

  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);

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

  const verstecke = React.useCallback(
    (messageId: string, versteckt: boolean) =>
      setzeVersteckt(chatId, messageId, versteckt, queryClient),
    [chatId, queryClient],
  );

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
    verstecke,
  };
}
