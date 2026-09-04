"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CheckIcon,
  LockIcon,
  MessageSquareTextIcon,
  PencilLineIcon,
  SendHorizontalIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addComment,
  removeComment,
  updateComment,
} from "@/lib/chat/turn-runner";
import type { ChatComment } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/**
 * Private Notizen an einer Nachricht.
 *
 * Auf jeder Nachricht erreichbar -- der Ausloeser blendet sich beim
 * Ueberfahren ein und bleibt sichtbar, sobald Notizen da sind. Ein Klick
 * oeffnet ein kleines Fenster mit den vorhandenen Notizen und einem Feld
 * fuer eine neue. Die Notizen erreichen das Modell nie; sie leben nur hier.
 */
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
  /** Zaehlt hoch, wenn die Palette hier eine Notiz will -- oeffnet das Fenster. */
  openSignal?: number;
  /** Wo das Fenster andockt -- bei Nutzernachrichten rechtsbuendig. */
  align?: "start" | "end";
}) {
  const client = useQueryClient();
  const [offen, setOffen] = React.useState(false);
  const hatNotizen = comments.length > 0;

  // Das Palette-Signal: oeffnen. Ein Frame Vorlauf, nicht direkt im
  // Effekt-Rumpf -- so ruegt der Linter die Kaskade nicht (wie in der Tour).
  React.useEffect(() => {
    if (openSignal <= 0) return;
    const id = requestAnimationFrame(() => setOffen(true));
    return () => cancelAnimationFrame(id);
  }, [openSignal]);

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={hatNotizen ? `${comments.length} notes` : "Add a note"}
            className={cn(
              "inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[11px] font-medium transition-all",
              hatNotizen
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : cn(
                    "text-muted-foreground/70 hover:bg-muted/70 hover:text-foreground",
                    // Ohne Notizen zurueckhaltend: erst beim Ueberfahren der
                    // Nachricht (oder Fokus/geoeffnet) taucht er ganz auf.
                    "opacity-0 focus-visible:opacity-100 group-hover/message:opacity-100",
                    offen && "opacity-100",
                  ),
            )}
          />
        }
      >
        <MessageSquareTextIcon className="size-3.5" />
        {hatNotizen ? comments.length : "Note"}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-80 overflow-hidden rounded-2xl border-border/70 p-0 shadow-xl shadow-black/10"
      >
        <div className="flex items-center gap-1.5 border-b border-border/60 px-3.5 py-2.5">
          <LockIcon className="size-3 text-muted-foreground/60" />
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground/80">
            Private notes
          </span>
          <span className="ms-auto text-[10px] text-muted-foreground/50">
            only you can see these
          </span>
        </div>

        {hatNotizen ? (
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto p-2">
            {comments.map((comment) => (
              <NotizZeile
                key={comment.id}
                comment={comment}
                onSpeichern={(text) =>
                  updateComment(chatId, messageId, comment.id, text, client)
                }
                onEntfernen={() =>
                  removeComment(chatId, messageId, comment.id, client)
                }
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-center text-[12px] text-muted-foreground/60">
            No notes yet. Jot something down for later — it stays with this
            message.
          </p>
        )}

        <NotizFeld
          onAnlegen={(text) => addComment(chatId, messageId, text, client)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Eine einzelne Notiz -- Ansicht mit Zeit, auf Wunsch bearbeitbar. */
function NotizZeile({
  comment,
  onSpeichern,
  onEntfernen,
}: {
  comment: ChatComment;
  onSpeichern: (text: string) => void;
  onEntfernen: () => void;
}) {
  const [bearbeiten, setBearbeiten] = React.useState(false);
  const [text, setText] = React.useState(comment.text);

  if (bearbeiten) {
    return (
      <li className="rounded-xl bg-muted/50 p-2">
        <AutoTextarea
          value={text}
          autoFocus
          onChange={setText}
          onSubmit={() => {
            onSpeichern(text);
            setBearbeiten(false);
          }}
          onCancel={() => {
            setText(comment.text);
            setBearbeiten(false);
          }}
          className="bg-background"
        />
        <div className="mt-1.5 flex justify-end gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              setText(comment.text);
              setBearbeiten(false);
            }}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => {
              onSpeichern(text);
              setBearbeiten(false);
            }}
          >
            <CheckIcon className="size-3" />
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group/note flex flex-col gap-0.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/50">
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85 wrap-break-word">
        {comment.text}
      </p>
      <div className="flex items-center gap-2">
        <time className="text-[10px] text-muted-foreground/50">
          {relativeZeit(comment.createdAt)}
        </time>
        <div className="ms-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/note:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => setBearbeiten(true)}
            aria-label="Edit note"
            className="cursor-pointer rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
          >
            <PencilLineIcon className="size-3" />
          </button>
          <button
            type="button"
            onClick={onEntfernen}
            aria-label="Delete note"
            className="cursor-pointer rounded p-0.5 text-muted-foreground/50 hover:text-destructive"
          >
            <Trash2Icon className="size-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

/** Das Feld fuer eine neue Notiz -- Enter schickt, Shift+Enter neue Zeile. */
function NotizFeld({ onAnlegen }: { onAnlegen: (text: string) => void }) {
  const [text, setText] = React.useState("");

  const absenden = () => {
    if (!text.trim()) return;
    onAnlegen(text);
    setText("");
  };

  return (
    <div className="flex items-end gap-1.5 border-t border-border/60 p-2">
      <AutoTextarea
        value={text}
        onChange={setText}
        onSubmit={absenden}
        placeholder="Add a note…"
        className="flex-1"
      />
      <Button
        type="button"
        size="icon-sm"
        aria-label="Add note"
        disabled={!text.trim()}
        className="size-8 shrink-0 rounded-lg"
        onClick={absenden}
      >
        <SendHorizontalIcon className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * Ein Textfeld, das mit dem Inhalt mitwaechst. Enter schickt, Shift+Enter
 * macht eine neue Zeile, Escape bricht ab (wenn ein Abbruch gegeben ist).
 */
function AutoTextarea({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      autoFocus={autoFocus}
      rows={1}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
        } else if (event.key === "Escape" && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
      className={cn(
        "max-h-36 min-h-8 w-full resize-none rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/50 focus:border-primary/40",
        className,
      )}
    />
  );
}

/** "vor 3 Minuten" -- oder ein leerer String, wenn die Zeit unbrauchbar ist. */
function relativeZeit(iso: string): string {
  const zeit = new Date(iso);
  if (Number.isNaN(zeit.getTime())) return "";
  try {
    return formatDistanceToNow(zeit, { addSuffix: true });
  } catch {
    return "";
  }
}
