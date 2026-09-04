"use client";

import * as React from "react";
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  StickyNoteIcon,
  TextQuoteIcon,
  TextSelectIcon,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { dispatchQuote } from "@/lib/chat/commands";
import { cn } from "@/lib/utils";

/**
 * Rechtsklick auf eine Nachricht: zitieren, kopieren, notieren, ausblenden.
 *
 * Warum ueberhaupt ein eigenes Menue -- das Kommando "Quote selection" aus
 * Palette und Slash-Menue konnte nie funktionieren: beide ziehen den Fokus in
 * ein Eingabefeld, und der Browser verwirft dabei die Textauswahl. Bis der
 * Handler lief, war nichts mehr markiert. Der Rechtsklick ist der einzige
 * Moment, in dem die Auswahl noch steht.
 *
 * Das Menue oeffnet immer, nicht nur mit Auswahl. Ein Rechtsklick, der mal
 * das eigene und mal das Browsermenue zeigt, fuehlt sich kaputt an; statt
 * dessen passen sich die Eintraege an: mit Auswahl beziehen sie sich auf den
 * markierten Teil, ohne auf die ganze Nachricht.
 */
export function MessageContextMenu({
  messageId,
  role,
  text,
  hidden,
  onHide,
  onNote,
  className,
  children,
}: {
  messageId: string;
  role: "user" | "assistant";
  /** Der volle Text der Nachricht -- Grundlage, wenn nichts markiert ist. */
  text: string;
  hidden: boolean;
  onHide: (versteckt: boolean) => void;
  /** Eine private Notiz an dieser Nachricht anfangen. */
  onNote?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const bereich = React.useRef<HTMLDivElement>(null);

  // Die Auswahl wird beim Rechtsklick eingefroren. Sobald das Menue den Fokus
  // uebernimmt, kann sie weg sein -- wer sie erst im Klick auf den Eintrag
  // liest, liest zu spaet. Genau dieser Fehler steckte im alten Kommando.
  const [auswahl, setAuswahl] = React.useState("");

  const merkeAuswahl = React.useCallback(() => {
    setAuswahl(auswahlInnerhalb(bereich.current));
  }, []);

  const zitieren = () => {
    const roh = auswahl || text;
    if (!roh.trim()) return;
    dispatchQuote({ text: roh.trim(), role, messageId });
  };

  const kopieren = () => {
    const roh = auswahl || text;
    if (!roh.trim()) return;
    void navigator.clipboard.writeText(roh.trim());
  };

  const teilAuswahl = auswahl.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        // select-text schlaegt das select-none des Triggers: ohne das liesse
        // sich in einer Nachricht gar nichts markieren -- und damit auch
        // nichts zitieren, was der ganze Zweck dieses Menues ist.
        className={cn("select-text", className)}
        onContextMenu={merkeAuswahl}
        render={<div ref={bereich} />}
      >
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={zitieren}>
          <TextQuoteIcon />
          {teilAuswahl ? "Quote selection" : "Quote message"}
        </ContextMenuItem>
        <ContextMenuItem onClick={kopieren}>
          {teilAuswahl ? <TextSelectIcon /> : <CopyIcon />}
          {teilAuswahl ? "Copy selection" : "Copy message"}
        </ContextMenuItem>

        <ContextMenuSeparator />

        {onNote ? (
          <ContextMenuItem onClick={onNote}>
            <StickyNoteIcon />
            Add note
          </ContextMenuItem>
        ) : null}

        {hidden ? (
          <ContextMenuItem onClick={() => onHide(false)}>
            <EyeIcon />
            Show message
          </ContextMenuItem>
        ) : (
          <ContextMenuItem variant="destructive" onClick={() => onHide(true)}>
            <EyeOffIcon />
            Hide message
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Der markierte Text, beschnitten auf diesen Bereich.
 *
 * Eine Auswahl kann ueber mehrere Nachrichten laufen. Zitiert wird dann nur
 * der Teil, der in der Nachricht liegt, auf die geklickt wurde -- alles
 * andere zu uebernehmen hiesse, Text in ein Zitat zu holen, den man in dieser
 * Blase gar nicht sieht.
 */
function auswahlInnerhalb(bereich: HTMLElement | null): string {
  if (!bereich || typeof window === "undefined") return "";

  const auswahl = window.getSelection?.();
  if (!auswahl || auswahl.isCollapsed || auswahl.rangeCount === 0) return "";

  const gewaehlt = auswahl.getRangeAt(0);
  if (!gewaehlt.intersectsNode(bereich)) return "";

  const grenzen = document.createRange();
  grenzen.selectNodeContents(bereich);

  const beschnitten = gewaehlt.cloneRange();
  if (beschnitten.compareBoundaryPoints(Range.START_TO_START, grenzen) < 0) {
    beschnitten.setStart(grenzen.startContainer, grenzen.startOffset);
  }
  if (beschnitten.compareBoundaryPoints(Range.END_TO_END, grenzen) > 0) {
    beschnitten.setEnd(grenzen.endContainer, grenzen.endOffset);
  }

  return beschnitten.toString().trim();
}
