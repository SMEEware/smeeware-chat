"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  BracesIcon,
  BugPlay,
  EyeIcon,
  KeyRoundIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
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
import {
  BEFEHL,
  dispatchQuote,
  onBefehl,
  openChatCommand,
} from "@/lib/chat/commands";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessage } from "@/components/chat/chat-message";
import { ThemeToggle } from "@/components/theme-toggle";
import { useChat } from "@/hooks/use-chat";
import {
  useChats,
  useDeleteChat,
  useNewChat,
  useRenameChat,
} from "@/hooks/use-chats";
import { useModelOverride } from "@/lib/chat/model-store";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import type { ChatMessage as ChatMessageTyp } from "@/lib/chat/types";
import { useModels } from "@/hooks/use-models";
import { useSuggestions } from "@/hooks/use-suggestions";
import { SuggestionSkeleton } from "@/components/chat/suggestion-skeleton";
import Image from "next/image";
import Link from "next/link";

type ChatPanelProps = {
  chatId: string;
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
    verstecke,
  } = useChat({ chatId, initialMessages });

  const hasMessages = messages.length > 0;

  const eintraege = React.useMemo(() => gruppiereVersteckte(messages), [messages]);

  const [commentSignal, setCommentSignal] = React.useState(0);
  React.useEffect(
    () => onBefehl(BEFEHL.comment, () => setCommentSignal((z) => z + 1)),
    [],
  );
  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : null;

  const models = useModels();
  const modelOverride = useModelOverride((z) => z.model);
  const setModelOverride = useModelOverride((z) => z.setModel);
  const modelList = models.data?.models ?? [];
  const modelGroups = models.data?.groups;
  const defaultModel = models.data?.default ?? "";
  const activeModel = modelOverride ?? defaultModel;

  const suggestions = useSuggestions(!hasMessages);
  const suggestionItems = suggestions.data ?? [];

  const { data: chatListe } = useChats();
  const umbenennenMut = useRenameChat();
  const loeschenMut = useDeleteChat();
  const neuerChat = useNewChat();

  const [umbenennenOffen, setUmbenennenOffen] = React.useState(false);
  const [umbenennenWert, setUmbenennenWert] = React.useState("");
  const [loeschenOffen, setLoeschenOffen] = React.useState(false);

  const speichereUmbenennen = () => {
    const titel = umbenennenWert.trim();
    if (!titel) return;
    umbenennenMut.mutate(
      { id: chatId, title: titel },
      {
        onSuccess: () => toast.success("Chat renamed."),
        onError: () => toast.error("Couldn't rename the chat."),
      },
    );
    setUmbenennenOffen(false);
  };

  const refs = React.useRef({
    messages,
    send,
    model: activeModel,
    chats: chatListe,
  });
  React.useEffect(() => {
    refs.current = { messages, send, model: activeModel, chats: chatListe };
  });

  React.useEffect(() => {
    const letzteAntwort = () =>
      [...refs.current.messages]
        .reverse()
        .find((m) => m.role === "assistant" && !m.hidden) ?? null;

    const kopiere = async (text: string, erfolg: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(erfolg);
      } catch {
        toast.error("Couldn't copy — the clipboard is blocked here.");
      }
    };

    const abSummary = onBefehl(BEFEHL.summarizeChat, () => {
      if (refs.current.messages.length === 0) {
        toast.info("Nothing to summarize yet.");
        return;
      }
      refs.current.send(
        "Summarize our conversation so far — the key points, decisions, and any open questions.",
        refs.current.model || null,
      );
    });

    const abTranscript = onBefehl(BEFEHL.shareChatHistory, () => {
      const md = transcriptToMarkdown(refs.current.messages);
      if (!md) {
        toast.info("Nothing to copy yet.");
        return;
      }
      void kopiere(md, "Transcript copied as Markdown.");
    });

    const abLink = onBefehl(BEFEHL.shareLiveChat, () => {
      void kopiere(window.location.href, "Chat link copied.");
    });

    const abQuoteMsg = onBefehl(BEFEHL.referenceMessage, () => {
      const antwort = letzteAntwort();
      const text = antwort ? stripToolScaffolding(antwort.content).trim() : "";
      if (!antwort || !text) {
        toast.info("No answer to quote yet.");
        return;
      }
      dispatchQuote({ text, role: "assistant", messageId: antwort.id });
    });

    const abQuoteSel = onBefehl(BEFEHL.referenceContent, () => {
      const auswahl = window.getSelection?.()?.toString().trim() ?? "";
      if (!auswahl) {
        toast.info("Select some text in a message first, then quote it.");
        return;
      }
      const antwort = letzteAntwort();
      dispatchQuote({
        text: auswahl,
        role: "assistant",
        messageId: antwort?.id ?? "",
      });
    });

    const abRename = onBefehl(BEFEHL.renameChat, () => {
      const aktuell = refs.current.chats?.find((c) => c.id === chatId);
      if (!aktuell) {
        toast.info("Send a message first — then the chat can be renamed.");
        return;
      }
      setUmbenennenWert(aktuell.title);
      setUmbenennenOffen(true);
    });

    const abDelete = onBefehl(BEFEHL.deleteChat, () => {
      const gibtEs = refs.current.chats?.some((c) => c.id === chatId);
      if (!gibtEs) {
        toast.info("Nothing saved to delete yet.");
        return;
      }
      setLoeschenOffen(true);
    });

    return () => {
      abSummary();
      abTranscript();
      abLink();
      abQuoteMsg();
      abQuoteSel();
      abRename();
      abDelete();
    };
  }, [chatId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col select-text">
      <header className="shrink-0 border-b border-border/60">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4 md:h-18 md:px-6">
          <SidebarTrigger className="-ml-1 cursor-pointer text-muted-foreground hover:text-foreground" />

          {eingeklappt ? (
            <div className="hidden animate-in items-center gap-3 duration-300 fade-in slide-in-from-left-2 md:flex">
              <Link
                href="/"
                className="group flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground"
              >
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
                {eintraege.map((eintrag) =>
                  eintrag.art === "versteckt" ? (
                    <MessageScrollerItem
                      key={`hidden-${eintrag.ids[0]}`}
                      messageId={`hidden-${eintrag.ids[0]}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          eintrag.ids.forEach((id) => verstecke(id, false))
                        }
                        className="mx-auto flex items-center gap-1.5 rounded-full border border-dashed border-border/60 px-3 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:border-border hover:text-foreground"
                      >
                        <EyeIcon className="size-3" />
                        {eintrag.ids.length === 1
                          ? "1 hidden message"
                          : `${eintrag.ids.length} hidden messages`}
                        <span className="text-muted-foreground/50">·</span>
                        show
                      </button>
                    </MessageScrollerItem>
                  ) : (
                    <MessageScrollerItem
                      key={eintrag.message.id}
                      messageId={eintrag.message.id}
                      scrollAnchor={eintrag.message.role === "user"}
                    >
                      <ChatMessage
                        message={eintrag.message}
                        chatId={chatId}
                        commentSignal={
                          eintrag.message.id === lastMessageId
                            ? commentSignal
                            : 0
                        }
                        onHide={verstecke}
                      />
                    </MessageScrollerItem>
                  ),
                )}

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
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 md:px-6">
          <Empty className="p-6 select-none">
            <EmptyHeader>
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

      <Dialog open={umbenennenOffen} onOpenChange={setUmbenennenOffen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>
              Give this conversation a title you&apos;ll recognize later.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={umbenennenWert}
            onChange={(event) => setUmbenennenWert(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                speichereUmbenennen();
              }
            }}
            placeholder="Chat title"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUmbenennenOffen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                umbenennenWert.trim().length === 0 || umbenennenMut.isPending
              }
              onClick={speichereUmbenennen}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={loeschenOffen} onOpenChange={setLoeschenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation will be removed for good. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                loeschenMut.mutate(chatId, {
                  onSuccess: () => {
                    toast.success("Chat deleted.");
                    neuerChat();
                  },
                  onError: () => toast.error("Couldn't delete the chat."),
                });
                setLoeschenOffen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type Eintrag =
  | { art: "nachricht"; message: ChatMessageTyp }
  | { art: "versteckt"; ids: string[] };

function gruppiereVersteckte(messages: ChatMessageTyp[]): Eintrag[] {
  const eintraege: Eintrag[] = [];

  for (const message of messages) {
    if (!message.hidden) {
      eintraege.push({ art: "nachricht", message });
      continue;
    }

    const letzter = eintraege[eintraege.length - 1];
    if (letzter?.art === "versteckt") {
      letzter.ids.push(message.id);
    } else {
      eintraege.push({ art: "versteckt", ids: [message.id] });
    }
  }

  return eintraege;
}

function transcriptToMarkdown(alle: ChatMessageTyp[]): string {
  const messages = alle.filter((m) => !m.hidden);
  const teile = messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => {
      const wer = m.role === "user" ? "**You**" : "**Assistant**";
      const text =
        m.role === "assistant" ? stripToolScaffolding(m.content) : m.content;
      return `${wer}:\n\n${text.trim()}`;
    });
  return teile.join("\n\n---\n\n");
}

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
