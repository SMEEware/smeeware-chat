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

/**
 * Private Notizen an einer Nachricht -- als Randbemerkung, nicht als Fenster.
 *
 * Vorher lagen sie hinter einem Popover, das ein Chip unter jeder Nachricht
 * oeffnete. Das war der Fehler: eine Notiz ist eine Anmerkung, und ihr ganzer
 * Wert besteht darin, neben dem zu stehen, was sie anmerkt. Hinter einem
 * Klick versteckt weiss man nicht einmal, dass es sie gibt -- und der Chip
 * unter jeder Nachricht machte den Verlauf unruhig, um genau das zu sagen.
 *
 * Jetzt stehen sie da, wo sie hingehoeren: unter der Nachricht, eingerueckt
 * an einer Haarlinie, kleiner und leiser als das Gespraech. Angelegt werden
 * sie ueber das Kontextmenue der Nachricht oder die Palette; ohne Notizen ist
 * hier nichts zu sehen und nichts im Weg.
 *
 * Die Notizen erreichen das Modell nie -- sie leben nur im Verlauf.
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
  /** Zaehlt hoch, wenn Palette oder Kontextmenue hier eine Notiz wollen. */
  openSignal?: number;
  /** Bei Nutzernachrichten haengt der Strich rechts statt links. */
  align?: "start" | "end";
}) {
  const client = useQueryClient();
  const [entwurf, setEntwurf] = React.useState<string | null>(null);

  /**
   * Nur eine ECHTE Erhoehung oeffnet den Entwurf -- nicht ein Wert, der beim
   * Einhaengen schon ueber null lag.
   *
   * Der Palettenzaehler wird immer an die letzte Nachricht gereicht. Wer ihn
   * einmal benutzt hat, haengt danach jede neu ankommende Nachricht mit
   * demselben Wert ein; eine Pruefung auf ``> 0`` haette dann bei jeder
   * Antwort ungefragt ein Notizfeld aufgeklappt. Der Ausgangswert im Ref ist
   * der beim Einhaengen -- ab da zaehlt nur noch, was dazukommt.
   */
  const gesehen = React.useRef(openSignal);

  // Ein Frame Vorlauf statt setState direkt im Effekt-Rumpf -- sonst ruegt
  // der Linter die Kaskade (dieselbe Loesung wie in der Tour).
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
        // Die Haarlinie sitzt auf der Seite, die zur Nachricht zeigt, und
        // bindet die Notizen sichtbar an sie.
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

/**
 * Eine Notiz. Ein Klick auf den Text macht sie bearbeitbar -- kein
 * Stift-Symbol, das erst erscheinen muss, und keine Save-Leiste darunter:
 * Enter schliesst ab, Escape verwirft, ein Klick daneben speichert.
 */
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
          // Leer heisst geloescht: ein leeres Kaestchen stehen zu lassen
          // waere ein Zustand, den niemand gewollt hat.
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

/**
 * Das Feld -- fuer eine neue Notiz wie fuers Bearbeiten einer bestehenden.
 *
 * Kein Rahmen, kein Knopf: es sitzt genau dort, wo die Notiz danach steht,
 * und sieht ihr so aehnlich wie moeglich. Was man tippt, ist bereits das
 * Ergebnis.
 */
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

  // Waechst mit dem Inhalt, damit das Feld nie scrollt, solange die Notiz
  // kurz ist -- und das ist sie fast immer.
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
