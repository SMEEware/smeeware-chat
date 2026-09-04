"use client";

import Link from "next/link";

import { ChatPanel } from "@/components/chat/chat-panel";
import { PublicChatView } from "@/components/chat/public-chat-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/hooks/use-account";
import { useChatDetail } from "@/hooks/use-chats";
import { ChatNotFound } from "@/lib/chat/history";

/**
 * Die Weiche an dieser Adresse.
 *
 * Dieselbe URL bedient zwei sehr verschiedene Faelle: den eigenen Verlauf
 * (angemeldet, bearbeitbar) und die Leseansicht eines geteilten Chats (nicht
 * angemeldet). Entschieden wird am Konto, nicht an einem fehlgeschlagenen
 * Ladeversuch -- ein 401 als Steuersignal zu benutzen hiesse, jeden anderen
 * Fehler mit "dann eben oeffentlich" zu beantworten.
 *
 * Zwei Komponenten statt zweier Zweige in einer: die Hooks unterscheiden
 * sich, und bedingt aufrufen darf man sie nicht.
 */
export function ChatView({ id }: { id: string }) {
  const konto = useAccount();

  // Erst entscheiden, wenn feststeht, wer da ist. Sonst blitzt fuer einen
  // Moment die oeffentliche Ansicht auf, bevor der eigene Chat erscheint.
  if (konto.isPending) return <VerlaufSkelett />;

  if (!konto.data?.authenticated) return <PublicChatView id={id} />;

  return <EigenerChat id={id} />;
}

/**
 * Haengt einen gespeicherten Verlauf ein.
 *
 * Das Panel wird erst gerendert, wenn der Verlauf da ist -- und dann mit
 * ``key``. Beides zusammen ist der Punkt: der Chat uebernimmt die
 * Nachrichten genau einmal, beim Einhaengen. Wuerde er frueher starten,
 * bliebe er leer; ohne key wuerde beim Wechsel von einem Chat zum
 * naechsten der alte Zustand stehen bleiben.
 */
function EigenerChat({ id }: { id: string }) {
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
