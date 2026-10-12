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
import { useT } from "@/context/i18n-provider";

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
  onHide: (hidden: boolean) => void;
  onNote?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const area = React.useRef<HTMLDivElement>(null);

  const [selection, setSelection] = React.useState("");

  const rememberSelection = React.useCallback(() => {
    setSelection(selectionInside(area.current));
  }, []);

  const quoteMessage = () => {
    const raw = selection || text;
    if (!raw.trim()) return;
    dispatchQuote({ text: raw.trim(), role, messageId });
  };

  const copying = () => {
    const raw = selection || text;
    if (!raw.trim()) return;
    void navigator.clipboard.writeText(raw.trim());
  };

  const selectionPart = selection.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn("select-text", className)}
        onContextMenu={rememberSelection}
        render={<div ref={area} />}
      >
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={quoteMessage}>
          <TextQuoteIcon />
          {selectionPart ? t("contextMenu.quoteSelection") : t("contextMenu.quoteMessage")}
        </ContextMenuItem>
        <ContextMenuItem onClick={copying}>
          {selectionPart ? <TextSelectIcon /> : <CopyIcon />}
          {selectionPart ? t("contextMenu.copySelection") : t("contextMenu.copyMessage")}
        </ContextMenuItem>

        <ContextMenuSeparator />

        {onNote ? (
          <ContextMenuItem onClick={onNote}>
            <StickyNoteIcon />
            {t("contextMenu.addNote")}
          </ContextMenuItem>
        ) : null}

        {hidden ? (
          <ContextMenuItem onClick={() => onHide(false)}>
            <EyeIcon />
            {t("contextMenu.showMessage")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem variant="destructive" onClick={() => onHide(true)}>
            <EyeOffIcon />
            {t("contextMenu.hideMessage")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function selectionInside(area: HTMLElement | null): string {
  if (!area || typeof window === "undefined") return "";

  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";

  const selected = selection.getRangeAt(0);
  if (!selected.intersectsNode(area)) return "";

  const bounds = document.createRange();
  bounds.selectNodeContents(area);

  const clipped = selected.cloneRange();
  if (clipped.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) {
    clipped.setStart(bounds.startContainer, bounds.startOffset);
  }
  if (clipped.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) {
    clipped.setEnd(bounds.endContainer, bounds.endOffset);
  }

  return clipped.toString().trim();
}
