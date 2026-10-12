"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AppNotification = {
  id: string;
  level: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

type KeyList = { count: number; unread: number; notifications: AppNotification[] };

export const noticeKey = ["notifications"] as const;

export function useNotifications() {
  return useQuery<KeyList>({
    queryKey: noticeKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/notifications", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as KeyList;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useNotificationActions() {
  const client = useQueryClient();
  const next = () => client.invalidateQueries({ queryKey: noticeKey });

  const isRead = useMutation({
    mutationFn: () => fetch("/api/notifications", { method: "POST" }),
    onSuccess: next,
  });

  const pendingDelete = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: noticeKey });
      const previous = client.getQueryData<KeyList>(noticeKey);
      client.setQueryData<KeyList>(noticeKey, (list) =>
        list
          ? {
              ...list,
              count: list.count - 1,
              notifications: list.notifications.filter((h) => h.id !== id),
            }
          : list,
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(noticeKey, context.previous);
    },
    onSettled: next,
  });

  const deleteAll = useMutation({
    mutationFn: () => fetch("/api/notifications", { method: "DELETE" }),
    onSuccess: next,
  });

  return { isRead, pendingDelete, deleteAll };
}
