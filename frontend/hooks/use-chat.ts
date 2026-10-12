"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  subscribe,
  clearError,
  getSnapshot,
  getServerSnapshot,
  seedHistory,
  setRestoreHandler,
  setMessageHidden,
  steer,
  startTurn,
  stopTurn,
  withdrawSteer,
} from "@/lib/chat/turn-runner";
import type { Attachment, ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { selectActiveWorkspace, useWorkspaces } from "@/lib/workspaces/store";

type UseChatOptions = {
  chatId: string;
  initialMessages?: ChatMessage[];
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useChat({ chatId, initialMessages }: UseChatOptions) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const workspace = useWorkspaces(selectActiveWorkspace);

  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);

  const [seed] = React.useState(() => {
    if (initialMessages?.length) seedHistory(chatId, initialMessages);
    return initialMessages;
  });

  const subscribeToRun = React.useCallback(
    (listener: () => void) => subscribe(chatId, listener, seed),
    [chatId, seed],
  );
  const read = React.useCallback(() => getSnapshot(chatId), [chatId]);

  const stand = React.useSyncExternalStore(
    subscribeToRun,
    read,
    getServerSnapshot,
  );

  React.useEffect(() => {
    setRestoreHandler(chatId, (restore) => {
      setInput(restore.text);
      if (restore.attachments.length > 0) {
        setAttachments(restore.attachments);
      }
    });
    return () => setRestoreHandler(chatId, null);
  }, [chatId]);

  const send = React.useCallback(
    (
      text: string,
      model: string | null = null,
      extra: { viaCall?: boolean } = {},
    ) => {
      const clean = text.trim();
      if (!clean) return;

      if (stand.streaming) {
        if (steer(chatId, clean)) setInput("");
        return;
      }

      setInput("");
      const attached = attachments;
      setAttachments([]);

      startTurn({
        chatId,
        history: [
          ...stand.messages,
          {
            id: newId(),
            role: "user",
            content: clean,
            attachments: attached.length > 0 ? attached : undefined,
            viaCall: extra.viaCall || undefined,
          },
        ],
        model,
        prompt: settings.prompt,
        tools: settings.tools,
        voiceId: settings.voiceId,
        ttsModel: settings.ttsModel,
        workspace,
        client: queryClient,
      });
    },
    [
      attachments,
      chatId,
      settings.prompt,
      settings.tools,
      settings.voiceId,
      settings.ttsModel,
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

      startTurn({
        chatId,
        history,
        model,
        prompt: settings.prompt,
        tools: settings.tools,
        voiceId: settings.voiceId,
        ttsModel: settings.ttsModel,
        workspace,
        client: queryClient,
      });
    },
    [
      chatId,
      settings.prompt,
      settings.tools,
      settings.voiceId,
      settings.ttsModel,
      workspace,
      queryClient,
      stand.messages,
      stand.streaming,
    ],
  );

  const stop = React.useCallback(() => stopTurn(chatId), [chatId]);
  const withdraw = React.useCallback(
    (id: string) => withdrawSteer(chatId, id),
    [chatId],
  );
  const dismissError = React.useCallback(() => clearError(chatId), [chatId]);

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

  const hide = React.useCallback(
    (messageId: string, hidden: boolean) =>
      setMessageHidden(chatId, messageId, hidden, queryClient),
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
    queued: stand.queued,
    withdraw,
    error: stand.error,
    dismissError,
    health,
    hide,
  };
}
