"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  ChatNotFound,
  deleteAllChats,
  deleteChat,
  fetchChat,
  fetchChats,
  leererChat,
  newChatId,
  renameChat,
} from "@/lib/chat/history";
import type { ChatSummary } from "@/lib/chat/types";

/**
 * Zwei getrennte Schluesselwurzeln, und das mit Absicht: nach jedem
 * gespeicherten Turn wird die *Liste* ungueltig, damit Titel und
 * Reihenfolge stimmen. Der geladene Verlauf darf davon nicht beruehrt
 * werden -- er wandert beim Einhaengen einmal in den lokalen Zustand des
 * Chats, ein Nachladen wuerde ihn dort nicht mehr erreichen, aber unnoetig
 * Last erzeugen.
 */
export const chatKeys = {
  list: ["chats", "list"] as const,
  detail: (id: string) => ["chats", "detail", id] as const,
};

export function invalidateChatList(client: QueryClient) {
  return client.invalidateQueries({ queryKey: chatKeys.list });
}

/** Alle gespeicherten Chats, neueste zuerst (das sortiert das Backend). */
export function useChats() {
  return useQuery({
    queryKey: chatKeys.list,
    queryFn: ({ signal }) => fetchChats(signal),
    staleTime: 10_000,
    retry: 1,
  });
}

/**
 * Ein Verlauf zum Einhaengen. ``enabled`` erst, wenn es eine id gibt --
 * auf /chat (neuer Chat) gibt es nichts zu laden.
 */
export function useChatDetail(id: string | null) {
  return useQuery({
    queryKey: chatKeys.detail(id ?? "neu"),
    queryFn: ({ signal }) => fetchChat(id!, signal),
    enabled: Boolean(id),
    // Der Verlauf wird genau einmal gebraucht: beim Einhaengen. Danach
    // fuehrt ihn der Chat selbst weiter.
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // Ein 404 ist bei einer frisch gezogenen id die Regel, kein Ausfall --
    // darauf zu warten waere reine Verzoegerung vor dem leeren Chat.
    retry: (anzahl, fehler) =>
      !(fehler instanceof ChatNotFound) && anzahl < 1,
  });
}

/**
 * "New chat": eine id ziehen und hin navigieren.
 *
 * Die id entsteht *vor* der Navigation, nicht erst beim ersten Senden.
 * Damit ist jeder neue Chat eine eigene Adresse -- und ein Sprung dorthin
 * immer ein echter Wechsel. Solange nichts gesendet wurde, steht der Chat
 * nur im Cache; geschrieben wird er erst mit der ersten Frage.
 */
export function useNewChat() {
  const router = useRouter();
  const client = useQueryClient();

  return React.useCallback(() => {
    const id = newChatId();
    client.setQueryData(chatKeys.detail(id), leererChat(id));
    router.push(`/chat/${id}`);
  }, [client, router]);
}

/**
 * Klickbehandlung fuer einen "New chat"-Link. Der normale Klick oeffnet den
 * neuen Chat hier; Mittel- und Cmd-Klick bleiben ein Link auf /chat, damit
 * ein neuer Tab weiterhin funktioniert -- dort zieht die Route selbst eine
 * frische id.
 */
export function oeffneNeuenChat(neuerChat: () => void) {
  return (event: React.MouseEvent) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    neuerChat();
  };
}

export function useRenameChat() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameChat(id, title),

    // Der neue Titel steht sofort in der Liste -- kein Flackern, waehrend
    // die Runde laeuft.
    onMutate: async ({ id, title }) => {
      await client.cancelQueries({ queryKey: chatKeys.list });
      const vorher = client.getQueryData<ChatSummary[]>(chatKeys.list);
      client.setQueryData<ChatSummary[]>(chatKeys.list, (liste) =>
        (liste ?? []).map((chat) =>
          chat.id === id ? { ...chat, title } : chat,
        ),
      );
      return { vorher };
    },

    onError: (_error, _variablen, context) => {
      if (context?.vorher) client.setQueryData(chatKeys.list, context.vorher);
    },

    onSettled: () => invalidateChatList(client),
  });
}

/**
 * Alles loeschen.
 *
 * Kein optimistisches Leeren wie beim einzelnen Chat: dort ist das Ergebnis
 * absehbar, hier faellt der ganze Verlauf weg, und ein Zuruecknehmen nach
 * einem Fehler waere ein Aufblitzen der Liste, das aussieht wie ein Fehler
 * fuer sich. Wir warten die Antwort ab und raeumen dann alles auf einmal.
 */
export function useDeleteAllChats() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => deleteAllChats(),

    onSuccess: () => {
      client.setQueryData<ChatSummary[]>(chatKeys.list, []);
      // Auch die einzelnen Verlaeufe raus -- sonst zeigte ein Zurueck im
      // Browser einen Chat, den es nicht mehr gibt.
      client.removeQueries({ queryKey: ["chats", "detail"] });
      return invalidateChatList(client);
    },
  });
}

export function useDeleteChat() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteChat(id),

    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: chatKeys.list });
      const vorher = client.getQueryData<ChatSummary[]>(chatKeys.list);
      client.setQueryData<ChatSummary[]>(chatKeys.list, (liste) =>
        (liste ?? []).filter((chat) => chat.id !== id),
      );
      return { vorher };
    },

    onError: (_error, _id, context) => {
      if (context?.vorher) client.setQueryData(chatKeys.list, context.vorher);
    },

    onSuccess: (_daten, id) => {
      client.removeQueries({ queryKey: chatKeys.detail(id) });
    },

    onSettled: () => invalidateChatList(client),
  });
}
