"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  EyeIcon,
  KeyRoundIcon,
  RotateCcwIcon,
  SearchIcon,
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
  COMMAND_EVENT,
  dispatchQuote,
  onCommand,
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
import { useIsDesktop } from "@/hooks/use-mobile";
import { useSuggestions } from "@/hooks/use-suggestions";
import { QueuedMessages } from "@/components/chat/queued-messages";
import { VoiceCall } from "@/components/chat/voice-call";
import { SuggestionSkeleton } from "@/components/chat/suggestion-skeleton";
import Image from "next/image";
import Link from "next/link";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

type ChatPanelProps = {
  chatId: string;
  initialMessages?: ChatMessageTyp[];
};

export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
  const t = useT();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

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
    queued,
    withdraw,
    error,
    dismissError,
    health,
    hide,
  } = useChat({ chatId, initialMessages });

  const hasMessages = messages.length > 0;

  const entries = React.useMemo(
    () => groupHidden(messages),
    [messages],
  );

  const answer = React.useMemo(() => answersToQuestions(messages), [messages]);

  const [commentSignal, setCommentSignal] = React.useState(0);
  const [call, setCallOpen] = React.useState(false);
  React.useEffect(() => onCommand(COMMAND_EVENT.voiceCall, () => setCallOpen(true)), []);

  React.useEffect(
    () => onCommand(COMMAND_EVENT.comment, () => setCommentSignal((z) => z + 1)),
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

  const isDesktop = useIsDesktop();
  const suggestions = useSuggestions(!hasMessages && isDesktop);
  const suggestionItems = suggestions.data ?? [];

  const { data: chatList } = useChats();
  const renameMutation = useRenameChat();
  const deleteMutation = useDeleteChat();
  const newChat = useNewChat();

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const saveRename = () => {
    const title = renameValue.trim();
    if (!title) return;
    renameMutation.mutate(
      { id: chatId, title },
      {
        onSuccess: () => toast.success(t("panel.chatRenamed")),
        onError: () => toast.error(t("panel.renameFailed")),
      },
    );
    setRenameOpen(false);
  };

  const refs = React.useRef({
    messages,
    send,
    model: activeModel,
    chats: chatList,
  });
  React.useEffect(() => {
    refs.current = { messages, send, model: activeModel, chats: chatList };
  });

  React.useEffect(() => {
    const lastAnswer = () =>
      [...refs.current.messages]
        .reverse()
        .find((m) => m.role === "assistant" && !m.hidden) ?? null;

    const copyText = async (text: string, success: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(success);
      } catch {
        toast.error(t("sidebar.clipboardBlocked"));
      }
    };

    const unsubSummary = onCommand(COMMAND_EVENT.summarizeChat, () => {
      if (refs.current.messages.length === 0) {
        toast.info(t("panel.nothingToSummarize"));
        return;
      }
      refs.current.send(
        t("panel.summarizePrompt"),
        refs.current.model || null,
      );
    });

    const unsubTranscript = onCommand(COMMAND_EVENT.shareChatHistory, () => {
      const md = transcriptToMarkdown(refs.current.messages, t);
      if (!md) {
        toast.info(t("panel.nothingToCopy"));
        return;
      }
      void copyText(md, t("panel.transcriptCopied"));
    });

    const unsubLink = onCommand(COMMAND_EVENT.shareLiveChat, () => {
      void copyText(window.location.href, t("sidebar.chatLinkCopied"));
    });

    const unsubQuoteMessage = onCommand(COMMAND_EVENT.referenceMessage, () => {
      const response = lastAnswer();
      const text = response ? stripToolScaffolding(response.content).trim() : "";
      if (!response || !text) {
        toast.info(t("panel.noAnswerToQuote"));
        return;
      }
      dispatchQuote({ text, role: "assistant", messageId: response.id });
    });

    const unsubQuoteSelection = onCommand(COMMAND_EVENT.referenceContent, () => {
      const selection = window.getSelection?.()?.toString().trim() ?? "";
      if (!selection) {
        toast.info(t("panel.selectTextFirst"));
        return;
      }
      const response = lastAnswer();
      dispatchQuote({
        text: selection,
        role: "assistant",
        messageId: response?.id ?? "",
      });
    });

    const unsubRename = onCommand(COMMAND_EVENT.renameChat, () => {
      const current = refs.current.chats?.find((c) => c.id === chatId);
      if (!current) {
        toast.info(t("panel.sendFirstRename"));
        return;
      }
      setRenameValue(current.title);
      setRenameOpen(true);
    });

    const unsubDelete = onCommand(COMMAND_EVENT.deleteChat, () => {
      const exists = refs.current.chats?.some((c) => c.id === chatId);
      if (!exists) {
        toast.info(t("panel.nothingToDelete"));
        return;
      }
      setDeleteOpen(true);
    });

    return () => {
      unsubSummary();
      unsubTranscript();
      unsubLink();
      unsubQuoteMessage();
      unsubQuoteSelection();
      unsubRename();
      unsubDelete();
    };
  }, [chatId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col select-text">
      <header className="shrink-0 border-b border-border/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4 md:h-18 md:px-6">
          <SidebarTrigger className="-ml-1 cursor-pointer text-muted-foreground hover:text-foreground" />

          {collapsed ? (
            <div className="hidden animate-in items-center gap-3 duration-300 fade-in slide-in-from-left-2 md:flex">
              <Link
                href="/"
                className="group flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground"
              >
                <Image
                  src="/assets/img/icon.svg"
                  height={100}
                  width={100}
                  alt={t("panel.logoAlt")}
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
              aria-label={t("sidebar.searchChats")}
              title={t("panel.searchChatsTitle")}
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
                {entries.map((entry) =>
                  entry.kind === "hidden" ? (
                    <MessageScrollerItem
                      key={`hidden-${entry.ids[0]}`}
                      messageId={`hidden-${entry.ids[0]}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          entry.ids.forEach((id) => hide(id, false))
                        }
                        className="mx-auto flex items-center gap-1.5 rounded-full border border-dashed border-border/60 px-3 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:border-border hover:text-foreground"
                      >
                        <EyeIcon className="size-3" />
                        {entry.ids.length === 1
                          ? t("panel.hiddenOne")
                          : t("panel.hiddenMany", { count: entry.ids.length })}
                        <span className="text-muted-foreground/50">·</span>
                        {t("panel.show")}
                      </button>
                    </MessageScrollerItem>
                  ) : (
                    <MessageScrollerItem
                      key={entry.message.id}
                      messageId={entry.message.id}
                      scrollAnchor={entry.message.role === "user"}
                    >
                      <ChatMessage
                        message={entry.message}
                        chatId={chatId}
                        commentSignal={
                          entry.message.id === lastMessageId
                            ? commentSignal
                            : 0
                        }
                        onHide={hide}
                        onAnswer={(response) =>
                          send(response, activeModel || null)
                        }
                        answeredWith={answer.get(entry.message.id) ?? null}
                      />
                    </MessageScrollerItem>
                  ),
                )}

                {error ? (
                  <MessageScrollerItem messageId="error">
                    <Alert variant="destructive">
                      <AlertCircleIcon />
                      <AlertTitle>{t("panel.errorTitle")}</AlertTitle>
                      <AlertDescription>
                        <p>{error.message}</p>
                        <div className="flex gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => retry(activeModel || null)}
                          >
                            <RotateCcwIcon data-icon="inline-start" />
                            {t("panel.tryAgain")}
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={dismissError}
                          >
                            {t("panel.dismiss")}
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
                  alt={t("panel.logoAlt")}
                  className="size-12 m-0 p-0"
                />
              </EmptyMedia>
              <EmptyTitle className="flex flex-col font-heading text-2xl tracking-tight">
                <span className="font-light text-foreground/60 text-xs self-center rounded-full py-1 px-3 bg-sidebar w-fit mb-2">
                  SMEEware Chat
                </span>
                <span className="text-3xl md:text-4xl">
                  {" "}
                  <span className="text-primary font-bold">{t("panel.readyAccent")}</span>{" "}
                  {t("panel.readyRest")}
                </span>
              </EmptyTitle>
              <EmptyDescription className="text-xs md:text-sm">
                {t("panel.startConversation")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="w-full max-w-md flex-col items-stretch gap-2.5 sm:flex-row">
              <EntryLink
                href="/docs"
                icon={BookOpenIcon}
                title={t("panel.overviewTitle")}
                notice={t("panel.overviewNotice")}
              />
              <EntryLink
                href="/docs/authentication"
                icon={KeyRoundIcon}
                title={t("panel.apiTitle")}
                notice={t("panel.apiNotice")}
              />
            </EmptyContent>
          </Empty>
        </div>
      )}

      <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <QueuedMessages items={queued} onWithdraw={withdraw} />
          <VoiceCall
            open={call}
            onClose={() => setCallOpen(false)}
            messages={messages}
            isStreaming={isStreaming}
            send={(text) => send(text, activeModel || null, { viaCall: true })}
            stop={stop}
          />
          <ChatComposer
            value={input}
            onValueChange={setInput}
            onSubmit={(text) => send(text, activeModel || null)}
            onStop={stop}
            isStreaming={isStreaming}
            callActive={call}
            models={modelList}
            modelGroups={modelGroups}
            model={activeModel}
            onModelChange={setModelOverride}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />

          {!hasMessages ? (
            <div className="hidden md:block">
              {suggestionItems.length === 0 ? (
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
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("panel.renameChat")}</DialogTitle>
            <DialogDescription>
              {t("panel.renameDesc")}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveRename();
              }
            }}
            placeholder={t("panel.chatTitlePlaceholder")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              {t("sidebar.cancel")}
            </Button>
            <Button
              disabled={
                renameValue.trim().length === 0 || renameMutation.isPending
              }
              onClick={saveRename}
            >
              {t("panel.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteChatTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("panel.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sidebar.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                deleteMutation.mutate(chatId, {
                  onSuccess: () => {
                    toast.success(t("panel.chatDeleted"));
                    newChat();
                  },
                  onError: () => toast.error(t("panel.deleteError")),
                });
                setDeleteOpen(false);
              }}
            >
              {t("sidebar.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function answersToQuestions(messages: ChatMessageTyp[]): Map<string, string> {
  const out = new Map<string, string>();

  messages.forEach((message, index) => {
    if (message.role !== "assistant") return;
    const asking = message.parts?.some(
      (part) => part.type === "tool" && part.tool === "ask_user",
    );
    if (!asking) return;

    const response = messages
      .slice(index + 1)
      .find((later) => later.role === "user" && !later.hidden);
    if (response) out.set(message.id, response.content);
  });

  return out;
}

type Entry =
  | { kind: "message"; message: ChatMessageTyp }
  | { kind: "hidden"; ids: string[] };

function groupHidden(messages: ChatMessageTyp[]): Entry[] {
  const entries: Entry[] = [];

  for (const message of messages) {
    if (!message.hidden) {
      entries.push({ kind: "message", message });
      continue;
    }

    const last = entries[entries.length - 1];
    if (last?.kind === "hidden") {
      last.ids.push(message.id);
    } else {
      entries.push({ kind: "hidden", ids: [message.id] });
    }
  }

  return entries;
}

function transcriptToMarkdown(all: ChatMessageTyp[], t: TranslateFn): string {
  const messages = all.filter((m) => !m.hidden);
  const parts = messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => {
      const speaker = m.role === "user" ? `**${t("panel.transcriptYou")}**` : `**${t("panel.transcriptAssistant")}**`;
      const text =
        m.role === "assistant" ? stripToolScaffolding(m.content) : m.content;
      return `${speaker}:\n\n${text.trim()}`;
    });
  return parts.join("\n\n---\n\n");
}

function EntryLink({
  href,
  icon: Icon,
  title,
  notice,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  notice: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex w-full items-center gap-3 overflow-hidden sm:w-auto sm:flex-1 rounded-xl px-3.5 py-2.5 text-left ring-1 ring-border/70 transition-colors ring-inset hover:bg-primary/4 hover:ring-primary/40"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 -left-full w-full bg-linear-to-r from-transparent via-primary/12 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[200%]"
      />
      <Icon className="relative size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary" />
      <span className="relative min-w-0">
        <span className="block text-[13px] font-medium text-foreground/80 transition-colors group-hover:text-foreground">
          {title}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground/60">
          {notice}
        </span>
      </span>
      <ArrowUpRightIcon className="relative ms-auto size-3.5 shrink-0 -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
    </Link>
  );
}
