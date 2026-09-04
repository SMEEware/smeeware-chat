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
  fetchPublicChat,
  setChatPublic,
  leererChat,
  newChatId,
  renameChat,
} from "@/lib/chat/history";
import type { ChatSummary } from "@/lib/chat/types";

export const chatKeys = {
  list: ["chats", "list"] as const,
  detail: (id: string) => ["chats", "detail", id] as const,
};

export function invalidateChatList(client: QueryClient) {
  return client.invalidateQueries({ queryKey: chatKeys.list });
}

export function useChats() {
  return useQuery({
    queryKey: chatKeys.list,
    queryFn: ({ signal }) => fetchChats(signal),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useChatDetail(id: string | null) {
  return useQuery({
    queryKey: chatKeys.detail(id ?? "neu"),
    queryFn: ({ signal }) => fetchChat(id!, signal),
    enabled: Boolean(id),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (anzahl, fehler) =>
      !(fehler instanceof ChatNotFound) && anzahl < 1,
  });
}

export function useNewChat() {
  const router = useRouter();
  const client = useQueryClient();

  return React.useCallback(() => {
    const id = newChatId();
    client.setQueryData(chatKeys.detail(id), leererChat(id));
    router.push(`/chat/${id}`);
  }, [client, router]);
}

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

export function usePublicChat(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ["chats", "public", id ?? "neu"] as const,
    queryFn: ({ signal }) => fetchPublicChat(id!, signal),
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSetChatPublic() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, public: oeffentlich }: { id: string; public: boolean }) =>
      setChatPublic(id, oeffentlich),

    onMutate: async ({ id, public: oeffentlich }) => {
      await client.cancelQueries({ queryKey: chatKeys.list });
      const vorher = client.getQueryData<ChatSummary[]>(chatKeys.list);
      client.setQueryData<ChatSummary[]>(chatKeys.list, (liste) =>
        (liste ?? []).map((chat) =>
          chat.id === id ? { ...chat, public: oeffentlich } : chat,
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

export function useRenameChat() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameChat(id, title),

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

export function useDeleteAllChats() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => deleteAllChats(),

    onSuccess: () => {
      client.setQueryData<ChatSummary[]>(chatKeys.list, []);
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
