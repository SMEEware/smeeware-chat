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
import { AttachmentChips } from "@/components/chat/attachment-chips";
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

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const konto = useAccount();
  const zeigeDenken = useSettings((zustand) => zustand.thinking);

  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageAvatar className="rounded-full bg-transparent">
          <Image
            // Das eigene Bild, sobald eines hinterlegt ist. Der Zeitstempel
            // haengt dran, damit der Browser nach einem Wechsel wirklich das
            // neue holt statt des zwischengespeicherten alten.
            src={
              konto.data?.has_avatar
                ? `/api/account/avatar?v=${konto.dataUpdatedAt}`
                : "https://storage.smeeware.com/assets/profile_placeholder.png"
            }
            alt="Profile"
            height={32}
            width={32}
            unoptimized={Boolean(konto.data?.has_avatar)}
          />
          {/* <ZapIcon size={15} /> */}
        </MessageAvatar>
        <MessageContent className="flex flex-col items-end gap-2">
          {/* Ueber der Blase, nicht darin: die Dateien gehoerten zur Frage,
              standen aber nie in ihrem Text -- der Block dafuer entsteht
              erst auf dem Weg zum Modell. */}
          <AttachmentChips
            anhaenge={message.attachments ?? []}
            className="justify-end"
          />
          <UserMessage
            content={message.content}
            copySlot={
              <CopyButton
                text={message.content}
                label="Copy message"
                className="hover:text-foreground"
              />
            }
          />
        </MessageContent>
      </Message>
    );
  }

  const streaming = message.streaming ?? false;

  // Aeltere Nachrichten (vor der Abschnitts-Struktur) haben nur content.
  // Dann tut es ein einzelner Content-Abschnitt.
  const parts: MessagePart[] =
    message.parts && message.parts.length > 0
      ? message.parts
      : message.content
        ? [{ type: "content", text: message.content }]
        : [];

  const lastIndex = parts.length - 1;
  // Noch gar nichts da, aber der Turn laeuft schon: reiner Denk-Vorlauf.
  const bootThinking = streaming && parts.length === 0;

  return (
    <Message align="start">
      <MessageContent className="gap-3">
        {bootThinking && zeigeDenken ? (
          <Reasoning reasoning="" streaming thinking />
        ) : null}

        {parts.map((part, index) => {
          const isLast = index === lastIndex;

          if (part.type === "tool") {
            // Echter Werkzeugaufruf -- eigene Karte mit Status und Ergebnis.
            return (
              <ToolEvent
                key={part.callId}
                part={part}
                unterbrochen={message.interrupted ?? false}
              />
            );
          }

          if (part.type === "reasoning") {
            // Ausgeblendet heisst wirklich weg, nicht eingeklappt: wer das
            // Denken abstellt, will keine Reihe zugeklappter Kaesten sehen.
            // Erzeugt wird es trotzdem -- Reasoning-Modelle denken immer.
            if (!zeigeDenken) return null;
            // Denken -- ob vor der Antwort oder mitten drin, es bleibt der
            // Gedankengang. Werkzeuge haben ihre eigene Darstellung.
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

        {/* Die Fusszeile gibt es auch ohne Text, sobald der Turn
            unterbrochen wurde: bei einer Bilderzeugung besteht die halbe
            Antwort aus einem laufenden Werkzeug und sonst nichts -- ohne
            diesen Zweig staende dort eine Werkzeugzeile ohne jede
            Erklaerung, warum es nicht weitergeht. */}
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
      </MessageContent>
    </Message>
  );
}
