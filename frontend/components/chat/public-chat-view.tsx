"use client";

import Link from "next/link";
import { Globe2Icon, MessageSquareIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { ChatMessage } from "@/components/chat/chat-message";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePublicChat } from "@/hooks/use-chats";

/**
 * Ein geteilter Verlauf, gelesen von jemandem ohne Konto.
 *
 * Bewusst keine ausgegraute Fassung des Chats: kein Composer, keine
 * Seitenleiste, keine Werkzeuge, die nicht gehen. Fuer viele ist diese Seite
 * der erste Kontakt mit dem Produkt, und eine Oberflaeche voller toter
 * Knoepfe waere ein schlechter erster Eindruck. Was hier steht, ist eine
 * Leseansicht -- und die darf sich auch so anfuehlen.
 */
export function PublicChatView({ id }: { id: string }) {
  const { data, isPending, isError } = usePublicChat(id);

  if (isPending) return <LeseSkelett />;

  if (isError || !data) return <NichtGeteilt />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 md:px-6">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
              <Globe2Icon className="size-3" />
              Shared conversation
            </div>
            <h1 className="truncate font-heading text-lg leading-tight md:text-xl">
              {data.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground/70">
              <span>
                {data.message_count}{" "}
                {data.message_count === 1 ? "message" : "messages"}
              </span>
              {data.model ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{data.model}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <time dateTime={data.updated_at}>{alsDatum(data.updated_at)}</time>
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-8 md:px-6">
              {data.messages.map((message) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <ChatMessage message={message} chatId={id} readOnly />
                </MessageScrollerItem>
              ))}

              {/* Am Ende des Gelesenen, nicht als Banner davor: wer bis
                  hierher gekommen ist, hat einen Grund weiterzulesen. */}
              <div className="mt-4 flex flex-col items-center gap-3 border-t border-border/60 pt-8 pb-4 text-center">
                <p className="max-w-sm text-sm text-muted-foreground">
                  This is a read-only copy of a conversation someone shared.
                  Sign in to continue one of your own.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/login?next=%2Fchat">Sign in</Link>}
                />
              </div>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  );
}

/**
 * Nicht geteilt und gar nicht vorhanden sehen hier gleich aus -- so wie im
 * Backend, das fuer beides denselben 404 liefert. Eine Unterscheidung waere
 * die Auskunft, welche ids es gibt.
 */
function NichtGeteilt() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <MessageSquareIcon className="size-8 text-muted-foreground/40" />
      <p className="font-heading text-lg">Nothing shared here.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        This conversation is private, or the link is no longer valid.
      </p>
      <Button
        variant="outline"
        size="sm"
        render={<Link href="/login?next=%2Fchat">Sign in</Link>}
      />
    </div>
  );
}

function LeseSkelett() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
      <Skeleton className="h-6 w-64" />
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

/** Ein Datum, das ohne Uhrzeit auskommt -- die Stunde sagt hier nichts. */
function alsDatum(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return "";
  return datum.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
