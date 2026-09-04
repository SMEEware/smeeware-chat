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
  text: string;
  hidden: boolean;
  onHide: (versteckt: boolean) => void;
  onNote?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const bereich = React.useRef<HTMLDivElement>(null);

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
