"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, PlugZapIcon, SquareIcon } from "lucide-react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Markdown } from "@/components/chat/markdown";
import { Reasoning } from "@/components/chat/reasoning";
import { ToolEvent } from "@/components/chat/tool-event";
import { AskCard, asAskRequest } from "@/components/chat/ask-card";
import { AttachmentChips } from "@/components/chat/attachment-chips";
import { MessageComments } from "@/components/chat/message-comments";
import { MessageContextMenu } from "@/components/chat/message-context-menu";
import { useAccount } from "@/hooks/use-account";
import { useSettings } from "@/lib/settings/store";
import { UserMessage } from "@/components/chat/user-message";
import type {
  ChatMessage as ChatMessageType,
  MessagePart,
} from "@/lib/chat/types";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import Image from "next/image";

function OwnAvatar({
  account,
}: {
  account: ReturnType<typeof useAccount>;
}) {
  const name = account.data?.username?.trim() ?? "";
  const initials = name.charAt(0).toUpperCase() || "?";

  return (
    <MessageAvatar className="mt-0.5 me-1 size-8 min-w-0 self-start bg-transparent shadow-md ring-1 shadow-black/15 ring-border/80 ring-offset-2 ring-offset-background md:size-9 dark:shadow-black/40">
      {account.data?.has_avatar ? (
        <Image
          key={account.dataUpdatedAt}
          src={`/api/account/avatar?v=${account.dataUpdatedAt}`}
          alt={name}
          height={72}
          width={72}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center bg-linear-to-br from-primary/35 via-primary/15 to-primary/5 text-[13px] font-semibold text-primary md:text-sm">
          {initials}
        </span>
      )}
    </MessageAvatar>
  );
}

function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const t = useT();
  const resolvedLabel = label ?? t("message.copyAnswer");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("size-7 text-muted-foreground", className)}
            onClick={() => {
              navigator.clipboard.writeText(text).then(() => setCopied(true));
            }}
          />
        }
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span className="sr-only">{resolvedLabel}</span>
      </TooltipTrigger>
      <TooltipContent>{copied ? t("message.copied") : t("message.copy")}</TooltipContent>
    </Tooltip>
  );
}

export function ChatMessage({
  message,
  chatId,
  commentSignal = 0,
  onHide,
  readOnly = false,
  onAnswer,
  answeredWith = null,
}: {
  message: ChatMessageType;
  chatId: string;
  commentSignal?: number;
  onHide?: (messageId: string, hidden: boolean) => void;
  readOnly?: boolean;
  onAnswer?: (response: string) => void;
  answeredWith?: string | null;
}) {
  const t = useT();
  const showThinking = useSettings((state) => state.thinking);
  const account = useAccount();

  const [noteCounter, setNoteCounter] = React.useState(0);
  const noteSignal = commentSignal + noteCounter;

  const withMenu = (content: React.ReactNode, cls?: string) =>
    readOnly ? (
      content
    ) : (
      <MessageContextMenu
        messageId={message.id}
        role={message.role}
        text={
          message.role === "assistant"
            ? stripToolScaffolding(message.content)
            : message.content
        }
        hidden={message.hidden ?? false}
        onHide={(hidden) => onHide?.(message.id, hidden)}
        onNote={() => setNoteCounter((z) => z + 1)}
        className={cls}
      >
        {content}
      </MessageContextMenu>
    );

  if (message.role === "user") {
    return (
      <Message align="end">
        {readOnly ? null : <OwnAvatar account={account} />}
        <MessageContent className="flex flex-col items-end gap-2">
          <AttachmentChips
            attachmentList={message.attachments ?? []}
            className="justify-end"
          />
          {withMenu(
            <UserMessage
              content={message.content}
              copySlot={
                <CopyButton
                  text={message.content}
                  label={t("message.copyMessage")}
                  className="size-6 opacity-0 transition-opacity group-hover/message:opacity-60 hover:opacity-100! focus-visible:opacity-100"
                />
              }
            />,
            "flex w-full flex-col items-end",
          )}
          {readOnly ? null : (
            <MessageComments
              chatId={chatId}
              messageId={message.id}
              comments={message.comments}
              openSignal={noteSignal}
              align="end"
            />
          )}
        </MessageContent>
      </Message>
    );
  }

  const streaming = message.streaming ?? false;

  const parts: MessagePart[] =
    message.parts && message.parts.length > 0
      ? message.parts
      : message.content
        ? [{ type: "content", text: message.content }]
        : [];

  const lastIndex = parts.length - 1;
  const bootThinking = streaming && parts.length === 0;

  return (
    <Message align="start">
      <MessageContent className="gap-3">
        {withMenu(
          <>
            {bootThinking && showThinking ? (
              <Reasoning reasoning="" streaming thinking />
            ) : null}

        {parts.map((part, index) => {
          const isLast = index === lastIndex;

          if (part.type === "tool") {
            const question =
              part.tool === "ask_user" ? asAskRequest(part.arguments) : null;

            if (question) {
              return (
                <AskCard
                  key={part.callId}
                  question={question}
                  answered={answeredWith}
                  disabled={readOnly || streaming || !onAnswer}
                  onAnswer={(response) => onAnswer?.(response)}
                />
              );
            }

            return (
              <ToolEvent
                key={part.callId}
                part={part}
                interrupted={message.interrupted ?? false}
              />
            );
          }

          if (part.type === "reasoning") {
            if (!showThinking) return null;
            return (
              <Reasoning
                key={index}
                reasoning={part.text}
                streaming={streaming && isLast}
                thinking={streaming && isLast}
                durationMs={
                  !streaming && index === 0 ? message.durationMs : undefined
                }
              />
            );
          }

          return (
            <Bubble key={index} variant="ghost" align="start">
              <BubbleContent className="overflow-clip">
                <Markdown>{part.text}</Markdown>
                {streaming && isLast ? (
                  <span className="ms-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-caret-blink rounded-full bg-foreground/70 align-baseline" />
                ) : null}
              </BubbleContent>
            </Bubble>
          );
            })}
          </>,
          "flex flex-col gap-3",
        )}

        {!streaming && (message.content || message.interrupted) ? (
          <MessageFooter className="gap-1 px-0">
            {message.content ? (
              <CopyButton
                text={stripToolScaffolding(message.content)}
                className="opacity-50 transition-opacity group-hover/message:opacity-100 focus-visible:opacity-100"
              />
            ) : null}
            {message.interrupted ? (
              <span
                title={t("message.interruptedTitle")}
                className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
              >
                <PlugZapIcon className="size-3" />
                {t("message.interrupted")}
              </span>
            ) : null}
            {message.aborted ? (
              <span className="flex items-center gap-1 text-muted-foreground/70">
                <SquareIcon className="size-3 fill-current" />
                {t("message.stopped")}
              </span>
            ) : null}
            {message.model ? (
              <span className="ms-1 font-mono text-[11px] text-muted-foreground/60">
                {message.model}
              </span>
            ) : null}
          </MessageFooter>
        ) : null}

        {readOnly ? null : (
          <MessageComments
            chatId={chatId}
            messageId={message.id}
            comments={message.comments}
            openSignal={noteSignal}
          />
        )}
      </MessageContent>
    </Message>
  );
}
