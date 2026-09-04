"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Globe2Icon } from "lucide-react";

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
  const router = useRouter();
  const pfad = usePathname();

  /**
   * Nicht geteilt heisst: hier gibt es fuer Unangemeldete nichts, wohl aber
   * fuer die Person, der er gehoert. Deshalb zur Anmeldung statt in eine
   * Sackgasse -- mit ``next``, damit man nach dem Anmelden genau hier
   * herauskommt.
   *
   * Der Grund fuer das 404 bleibt dabei absichtlich offen: es koennte den
   * Chat nicht geben oder er ist bloss privat. Beides gleich zu behandeln
   * ist dieselbe Zurueckhaltung wie im Backend, das fuer beides denselben
   * Status liefert.
   */
  React.useEffect(() => {
    if (!isError) return;
    router.replace(`/login?next=${encodeURIComponent(pfad)}`);
  }, [isError, router, pfad]);

  // Waehrend der Weiterleitung weiter das Skelett: die Fehlermeldung waere
  // fuer einen Sekundenbruchteil zu sehen und dann weg.
  if (isPending || isError || !data) return <LeseSkelett />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 md:px-6">
          {/* Fuer jemanden ohne Konto ist das hier der einzige Hinweis
              darauf, wo er gelandet ist -- und der einzige Weg dorthin. */}
          <Link
            href="/"
            aria-label="SMEEware Chat"
            className="group flex size-11 shrink-0 items-center justify-center"
          >
            <Image
              src="/assets/img/icon.svg"
              height={44}
              width={44}
              alt=""
              className="h-auto w-full transition-transform duration-300 group-hover:scale-110"
            />
          </Link>

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
