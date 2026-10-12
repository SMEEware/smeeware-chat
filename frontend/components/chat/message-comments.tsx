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
import { useT } from "@/context/i18n-provider";

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
  const [draft, setDraft] = React.useState<string | null>(null);

  const seen = React.useRef(openSignal);

  React.useEffect(() => {
    if (openSignal <= seen.current) return;
    seen.current = openSignal;
    const id = requestAnimationFrame(() => setDraft(""));
    return () => cancelAnimationFrame(id);
  }, [openSignal]);

  if (comments.length === 0 && draft === null) return null;

  const right = align === "end";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        right
          ? "items-end border-e-2 border-border/50 pe-3 text-end"
          : "items-start border-s-2 border-border/50 ps-3",
      )}
    >
      {comments.map((comment) => (
        <NoteItem
          key={comment.id}
          comment={comment}
          right={right}
          onSave={(text) =>
            updateComment(chatId, messageId, comment.id, text, client)
          }
          onRemove={() =>
            removeComment(chatId, messageId, comment.id, client)
          }
        />
      ))}

      {draft !== null ? (
        <NoteInput
          value={draft}
          onChange={setDraft}
          onDone={(text) => {
            if (text.trim()) addComment(chatId, messageId, text, client);
            setDraft(null);
          }}
          onCancel={() => setDraft(null)}
        />
      ) : null}
    </div>
  );
}

function NoteItem({
  comment,
  right,
  onSave,
  onRemove,
}: {
  comment: ChatComment;
  right: boolean;
  onSave: (text: string) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = React.useState<string | null>(null);

  if (draft !== null) {
    return (
      <NoteInput
        value={draft}
        onChange={setDraft}
        onDone={(text) => {
          if (text.trim()) onSave(text);
          else onRemove();
          setDraft(null);
        }}
        onCancel={() => setDraft(null)}
      />
    );
  }

  return (
    <div
      className={cn(
        "group/note flex max-w-full items-baseline gap-2",
        right && "flex-row-reverse",
      )}
    >
      <button
        type="button"
        onClick={() => setDraft(comment.text)}
        className={cn(
          "cursor-text text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground transition-colors wrap-break-word hover:text-foreground",
          right ? "text-end" : "text-start",
        )}
      >
        {comment.text}
      </button>

      <span
        className={cn(
          "flex shrink-0 items-baseline gap-1.5 text-[10px] text-muted-foreground/45",
          right && "flex-row-reverse",
        )}
      >
        <time dateTime={comment.createdAt}>
          {relativeTime(comment.createdAt)}
        </time>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("comments.deleteNote")}
          className="cursor-pointer opacity-0 transition-opacity group-hover/note:opacity-100 hover:text-destructive focus-visible:opacity-100"
        >
          <XIcon className="size-3" />
        </button>
      </span>
    </div>
  );
}

function NoteInput({
  value,
  onChange,
  onDone,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onDone: (value: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      value={value}
      placeholder={t("comments.noteToSelf")}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onDone(value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      className="w-full resize-none rounded-md bg-muted/40 px-2 py-1 text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/45 focus:bg-muted/60"
    />
  );
}

function relativeTime(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return "";
  try {
    return formatDistanceToNow(time, { addSuffix: true });
  } catch {
    return "";
  }
}
