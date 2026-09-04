"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { XIcon } from "lucide-react";

import {
  addComment,
  removeComment,
  updateComment,
} from "@/lib/chat/turn-runner";
import type { ChatComment } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export function MessageComments({
  chatId,
  messageId,
  comments = [],
  openSignal = 0,
  align = "start",
}: {
  chatId: string;
  messageId: string;
  comments?: ChatComment[];
  openSignal?: number;
  align?: "start" | "end";
}) {
  const client = useQueryClient();
  const [entwurf, setEntwurf] = React.useState<string | null>(null);

  const gesehen = React.useRef(openSignal);

  React.useEffect(() => {
    if (openSignal <= gesehen.current) return;
    gesehen.current = openSignal;
    const id = requestAnimationFrame(() => setEntwurf(""));
    return () => cancelAnimationFrame(id);
  }, [openSignal]);

  if (comments.length === 0 && entwurf === null) return null;

  const rechts = align === "end";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        rechts
          ? "items-end border-e-2 border-border/50 pe-3 text-end"
          : "items-start border-s-2 border-border/50 ps-3",
      )}
    >
      {comments.map((comment) => (
        <Notiz
          key={comment.id}
          comment={comment}
          rechts={rechts}
          onSpeichern={(text) =>
            updateComment(chatId, messageId, comment.id, text, client)
          }
          onEntfernen={() =>
            removeComment(chatId, messageId, comment.id, client)
          }
        />
      ))}

      {entwurf !== null ? (
        <NotizFeld
          wert={entwurf}
          onChange={setEntwurf}
          onFertig={(text) => {
            if (text.trim()) addComment(chatId, messageId, text, client);
            setEntwurf(null);
          }}
          onAbbrechen={() => setEntwurf(null)}
        />
      ) : null}
    </div>
  );
}

function Notiz({
  comment,
  rechts,
  onSpeichern,
  onEntfernen,
}: {
  comment: ChatComment;
  rechts: boolean;
  onSpeichern: (text: string) => void;
  onEntfernen: () => void;
}) {
  const [entwurf, setEntwurf] = React.useState<string | null>(null);

  if (entwurf !== null) {
    return (
      <NotizFeld
        wert={entwurf}
        onChange={setEntwurf}
        onFertig={(text) => {
          if (text.trim()) onSpeichern(text);
          else onEntfernen();
          setEntwurf(null);
        }}
        onAbbrechen={() => setEntwurf(null)}
      />
    );
  }

  return (
    <div
      className={cn(
        "group/note flex max-w-full items-baseline gap-2",
        rechts && "flex-row-reverse",
      )}
    >
      <button
        type="button"
        onClick={() => setEntwurf(comment.text)}
        className={cn(
          "cursor-text text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground transition-colors wrap-break-word hover:text-foreground",
          rechts ? "text-end" : "text-start",
        )}
      >
        {comment.text}
      </button>

      <span
        className={cn(
          "flex shrink-0 items-baseline gap-1.5 text-[10px] text-muted-foreground/45",
          rechts && "flex-row-reverse",
        )}
      >
        <time dateTime={comment.createdAt}>
          {relativeZeit(comment.createdAt)}
        </time>
        <button
          type="button"
          onClick={onEntfernen}
          aria-label="Delete note"
          className="cursor-pointer opacity-0 transition-opacity group-hover/note:opacity-100 hover:text-destructive focus-visible:opacity-100"
        >
          <XIcon className="size-3" />
        </button>
      </span>
    </div>
  );
}

function NotizFeld({
  wert,
  onChange,
  onFertig,
  onAbbrechen,
}: {
  wert: string;
  onChange: (wert: string) => void;
  onFertig: (wert: string) => void;
  onAbbrechen: () => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [wert]);

  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      value={wert}
      placeholder="Note to self…"
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onFertig(wert)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onFertig(wert);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onAbbrechen();
        }
      }}
      className="w-full resize-none rounded-md bg-muted/40 px-2 py-1 text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/45 focus:bg-muted/60"
    />
  );
}

function relativeZeit(iso: string): string {
  const zeit = new Date(iso);
  if (Number.isNaN(zeit.getTime())) return "";
  try {
    return formatDistanceToNow(zeit, { addSuffix: true });
  } catch {
    return "";
  }
}
