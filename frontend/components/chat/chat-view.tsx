"use client";

import Link from "next/link";

import { ChatPanel } from "@/components/chat/chat-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatDetail } from "@/hooks/use-chats";
import { ChatNotFound } from "@/lib/chat/history";

/**
 * Haengt einen gespeicherten Verlauf ein.
 *
 * Das Panel wird erst gerendert, wenn der Verlauf da ist -- und dann mit
 * ``key``. Beides zusammen ist der Punkt: der Chat uebernimmt die
 * Nachrichten genau einmal, beim Einhaengen. Wuerde er frueher starten,
 * bliebe er leer; ohne key wuerde beim Wechsel von einem Chat zum
 * naechsten der alte Zustand stehen bleiben.
 */
export function ChatView({ id }: { id: string }) {
  const { data, isPending, isError, error } = useChatDetail(id);

  // Kein gespeicherter Chat unter dieser id: dann ist es ein neuer. Wer
  // "New chat" drueckt, hat ihn schon im Cache und kommt hier gar nicht
  // vorbei -- das hier faengt den direkten Aufruf von /chat ab, der auf
  // eine frische id umleitet.
  if (isError && error instanceof ChatNotFound) {
    return <ChatPanel key={id} chatId={id} />;
  }

  if (isPending) return <VerlaufSkelett />;

  if (isError || !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-heading text-lg">This chat is gone.</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error?.message ?? "It could not be loaded."}
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/chat">Start a new chat</Link>}
        />
      </div>
    );
  }

  return <ChatPanel key={id} chatId={id} initialMessages={data.messages} />;
}

function VerlaufSkelett() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
      {[0, 1, 2].map((zeile) => (
        <div key={zeile} className="flex flex-col gap-2">
          <Skeleton className="ml-auto h-9 w-52 rounded-3xl" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-8/12" />
        </div>
      ))}
    </div>
  );
}
