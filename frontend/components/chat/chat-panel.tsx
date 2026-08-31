"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  BracesIcon,
  BugPlay,
  KeyRoundIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { BackendStatus } from "@/components/chat/backend-status";
import { openChatCommand } from "@/lib/chat/commands";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessage } from "@/components/chat/chat-message";
import { ThemeToggle } from "@/components/theme-toggle";
import { useChat } from "@/hooks/use-chat";
import type { ChatMessage as ChatMessageTyp } from "@/lib/chat/types";
import { useModels } from "@/hooks/use-models";
import { useSuggestions } from "@/hooks/use-suggestions";
import { SuggestionSkeleton } from "@/components/chat/suggestion-skeleton";
import Image from "next/image";
import Link from "next/link";

type ChatPanelProps = {
  /** id aus der Route. Ein noch nicht gespeicherter Chat hat sie auch --
   *  sie entsteht beim Klick auf "New chat", nicht beim Senden. */
  chatId: string;
  /** Verlauf aus der Ablage. Leer bei einem neuen Chat. */
  initialMessages?: ChatMessageTyp[];
};

export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
  const { state } = useSidebar();
  const eingeklappt = state === "collapsed";

  const {
    messages,
    input,
    setInput,
    attachments,
    setAttachments,
    send,
    retry,
    stop,
    isStreaming,
    error,
    dismissError,
    health,
  } = useChat({ chatId, initialMessages });

  const hasMessages = messages.length > 0;

  // Modellauswahl: das Backend nennt das Standardmodell, der Nutzer kann
  // es ueberschreiben. Das effektive Modell = Auswahl, sonst Default --
  // ohne Sync-Effekt, damit vor der ersten Wahl schon eins gesetzt ist.
  const models = useModels();
  const [modelOverride, setModelOverride] = React.useState<string | null>(null);
  const modelList = models.data?.models ?? [];
  // Reihenfolge der Ueberschriften -- kommt vom Backend, nicht aus
  // der Reihenfolge der Modelle selbst.
  const modelGroups = models.data?.groups;
  const defaultModel = models.data?.default ?? "";
  const activeModel = modelOverride ?? defaultModel;

  // Nur auf der leeren Startseite gebraucht.
  const suggestions = useSuggestions(!hasMessages);
  const suggestionItems = suggestions.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col select-text">
      <header className="shrink-0 border-b border-border/60">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4 md:h-18 md:px-6">
          <SidebarTrigger className="-ml-1 cursor-pointer text-muted-foreground hover:text-foreground" />

          {/* Nur bei zugeklappter Sidebar: steht sie offen, traegt ihr Kopf
              schon Logo und Namen -- zweimal dasselbe nebeneinander waere
              Verdopplung. Klappt sie zu, ruecken beide hierher nach. */}
          {eingeklappt ? (
            <div className="hidden animate-in items-center gap-3 duration-300 fade-in slide-in-from-left-2 md:flex">
              <Link
                href="/"
                className="group flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground"
              >
                {/* <SparklesIcon className="size-3.5" /> */}
                <Image
                  src="/assets/img/icon.svg"
                  height={100}
                  width={100}
                  alt="SMEEware Logo"
                  className="w-full h-auto p-2 group-hover:scale-110 duration-300"
                />
              </Link>
              <span className="font-heading text-sm font-semibold tracking-tight select-none">
                SMEEware Chat
              </span>
            </div>
          ) : null}

          <BackendStatus
            online={health.data?.online}
            endpoint={health.data?.endpoint}
            latencyMs={health.data?.latencyMs}
            checkedAt={health.dataUpdatedAt}
            isStreaming={isStreaming}
          />

          <div className="ms-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={openChatCommand}
              aria-label="Search chats"
              title="Search chats (Ctrl/Cmd+K)"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <SearchIcon />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {hasMessages ? (
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-8 md:px-6">
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    // Die Frage bleibt oben stehen, waehrend die Antwort waechst.
                    scrollAnchor={message.role === "user"}
                  >
                    <ChatMessage message={message} />
                  </MessageScrollerItem>
                ))}

                {error ? (
                  <MessageScrollerItem messageId="error">
                    <Alert variant="destructive">
                      <AlertCircleIcon />
                      <AlertTitle>That didn&apos;t work</AlertTitle>
                      <AlertDescription>
                        <p>{error.message}</p>
                        <div className="flex gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => retry(activeModel || null)}
                          >
                            <RotateCcwIcon data-icon="inline-start" />
                            Try again
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={dismissError}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-4 md:px-6">
          <Empty className="p-6 select-none">
            <EmptyHeader>
              {/* <EmptyMedia variant="icon">
                <SparklesIcon />
              </EmptyMedia> */}
              <EmptyMedia variant="default">
                <Image
                  src="/assets/img/clip.gif"
                  height={250}
                  width={250}
                  alt="SMEEware Logo"
                  className="size-12 m-0 p-0"
                />
              </EmptyMedia>
              <EmptyTitle className="flex flex-col font-heading text-2xl tracking-tight">
                <span className="font-light text-foreground/60 text-xs self-center rounded-full py-1 px-3 bg-sidebar w-fit mb-2">
                  SMEEware Chat
                </span>
                <span className="text-3xl md:text-4xl">
                  {" "}
                  <span className="text-primary font-bold">Ready</span> when you
                  are.
                </span>
              </EmptyTitle>
              <EmptyDescription className="text-xs md:text-sm">
                Start a conversation and see where it takes you.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="w-full max-w-md flex-col items-stretch gap-2.5 sm:flex-row">
              <Einstieg
                href="/docs"
                icon={BookOpenIcon}
                titel="Overview"
                hinweis="API reference"
              />
              <Einstieg
                href="/docs/authentication"
                icon={KeyRoundIcon}
                titel="API"
                hinweis="Authentication"
              />
            </EmptyContent>
          </Empty>
        </div>
      )}

      <div className="shrink-0 px-4 pb-4 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <ChatComposer
            value={input}
            onValueChange={setInput}
            onSubmit={(text) => send(text, activeModel || null)}
            onStop={stop}
            isStreaming={isStreaming}
            models={modelList}
            modelGroups={modelGroups}
            model={activeModel}
            onModelChange={setModelOverride}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />

          {!hasMessages ? (
            suggestionItems.length === 0 ? (
              <SuggestionSkeleton />
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {suggestionItems.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="rounded-full text-muted-foreground cursor-pointer animate-in fade-in-0 zoom-in-95 duration-300 opacity-40 hover:opacity-100"
                    onClick={() => send(suggestion, activeModel || null)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>

      {!hasMessages ? <div aria-hidden className="flex-[0.8] shrink" /> : null}
    </div>
  );
}

/**
 * Zwei Einstiege unter der Begruessung, in derselben Sprache wie der
 * "New chat"-Knopf in der Sidebar: eine Haarlinie, die beim Hover die
 * Primaerfarbe annimmt, ein Schimmer, der einmal durchlaeuft, ein Pfeil,
 * der von rechts hereinkommt. Im Ruhezustand bleibt die Flaeche leer --
 * das Feld darunter soll die Aufmerksamkeit bekommen, nicht diese Zeile.
 */
function Einstieg({
  href,
  icon: Icon,
  titel,
  hinweis,
}: {
  href: string;
  icon: LucideIcon;
  titel: string;
  hinweis: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex w-full items-center gap-3 overflow-hidden sm:w-auto sm:flex-1 rounded-xl px-3.5 py-2.5 text-left ring-1 ring-border/70 transition-colors ring-inset hover:bg-primary/[0.04] hover:ring-primary/40"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-primary/12 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[200%]"
      />
      <Icon className="relative size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary" />
      <span className="relative min-w-0">
        <span className="block text-[13px] font-medium text-foreground/80 transition-colors group-hover:text-foreground">
          {titel}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground/60">
          {hinweis}
        </span>
      </span>
      <ArrowUpRightIcon className="relative ms-auto size-3.5 shrink-0 -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
    </Link>
  );
}
