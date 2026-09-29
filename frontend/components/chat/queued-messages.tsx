"use client";

import { CornerDownRightIcon, Loader2Icon, XIcon } from "lucide-react";

import type { QueuedMessage } from "@/lib/chat/types";

/**
 * Was waehrend einer laufenden Antwort nachgeschoben wurde und noch wartet.
 *
 * Steht direkt ueber dem Eingabefeld, weil es dorthin gehoert, wo man es
 * abgeschickt hat -- noch nicht im Verlauf, denn der Agent hat es noch nicht
 * gelesen. Sobald er es an einer Rundengrenze aufnimmt, verschwindet es hier
 * und taucht als eigene Frage im Verlauf auf. Bis dahin laesst es sich
 * zuruecknehmen.
 */
export function QueuedMessages({
  items,
  onWithdraw,
}: {
  items: QueuedMessage[];
  onWithdraw: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-card/60 p-2 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-1 duration-200"
    >
      <p className="flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground/80">
        <Loader2Icon className="size-3 animate-spin text-primary" />
        {items.length === 1 ? "Queued" : `${items.length} queued`} — picked up
        after the current step
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-start gap-2 rounded-xl bg-muted/40 px-2.5 py-1.5"
          >
            <CornerDownRightIcon className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
            <span className="min-w-0 flex-1 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85 line-clamp-3">
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => onWithdraw(item.id)}
              aria-label="Withdraw queued message"
              title="Withdraw"
              className="mt-0.5 shrink-0 cursor-pointer rounded-md p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
