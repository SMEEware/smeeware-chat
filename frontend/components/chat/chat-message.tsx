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
import { AskCard, alsRueckfrage } from "@/components/chat/ask-card";
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
import Image from "next/image";

function EigenesBild({
  konto,
}: {
  konto: ReturnType<typeof useAccount>;
}) {
  const name = konto.data?.username?.trim() ?? "";
  const initiale = name.charAt(0).toUpperCase() || "?";

  return (
    <MessageAvatar className="size-7 self-end bg-transparent ring-1 ring-border/60">
      {konto.data?.has_avatar ? (
        <Image
          key={konto.dataUpdatedAt}
          src={`/api/account/avatar?v=${konto.dataUpdatedAt}`}
          alt=""
          height={28}
          width={28}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center bg-muted text-[11px] font-semibold text-muted-foreground">
          {initiale}
        </span>
      )}
    </MessageAvatar>
  );
}

function CopyButton({
  text,
  label = "Copy answer",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
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
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
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
  onHide?: (messageId: string, versteckt: boolean) => void;
  readOnly?: boolean;
  onAnswer?: (antwort: string) => void;
  answeredWith?: string | null;
}) {
  const zeigeDenken = useSettings((zustand) => zustand.thinking);
  const konto = useAccount();

  const [notizZaehler, setNotizZaehler] = React.useState(0);
  const notizSignal = commentSignal + notizZaehler;

  const mitMenue = (kinder: React.ReactNode, klasse?: string) =>
    readOnly ? (
      kinder
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
        onHide={(versteckt) => onHide?.(message.id, versteckt)}
        onNote={() => setNotizZaehler((z) => z + 1)}
        className={klasse}
      >
        {kinder}
      </MessageContextMenu>
    );

  if (message.role === "user") {
    return (
      <Message align="end">
        {readOnly ? null : <EigenesBild konto={konto} />}
        <MessageContent className="flex flex-col items-end gap-2">
          <AttachmentChips
            anhaenge={message.attachments ?? []}
            className="justify-end"
          />
          {mitMenue(
            <UserMessage
              content={message.content}
              copySlot={
                <CopyButton
                  text={message.content}
                  label="Copy message"
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
              openSignal={notizSignal}
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
        {mitMenue(
          <>
            {bootThinking && zeigeDenken ? (
              <Reasoning reasoning="" streaming thinking />
            ) : null}

        {parts.map((part, index) => {
          const isLast = index === lastIndex;

          if (part.type === "tool") {
            const frage =
              part.tool === "ask_user" ? alsRueckfrage(part.arguments) : null;

            if (frage) {
              return (
                <AskCard
                  key={part.callId}
                  frage={frage}
                  beantwortet={answeredWith}
                  disabled={readOnly || streaming || !onAnswer}
                  onAntwort={(antwort) => onAnswer?.(antwort)}
                />
              );
            }

            return (
              <ToolEvent
                key={part.callId}
                part={part}
                unterbrochen={message.interrupted ?? false}
              />
            );
          }

          if (part.type === "reasoning") {
            if (!zeigeDenken) return null;
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
              <BubbleContent>
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
                title="The browser was reloaded or the session ended while this answer was still coming in. What you see is everything that arrived."
                className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
              >
                <PlugZapIcon className="size-3" />
                interrupted
              </span>
            ) : null}
            {message.aborted ? (
              <span className="flex items-center gap-1 text-muted-foreground/70">
                <SquareIcon className="size-3 fill-current" />
                stopped
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
            openSignal={notizSignal}
          />
        )}
      </MessageContent>
    </Message>
  );
}
