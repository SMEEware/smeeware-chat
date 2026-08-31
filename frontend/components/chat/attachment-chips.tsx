"use client";

import * as React from "react";
import Image from "next/image";
import { FileTextIcon, XIcon } from "lucide-react";

import { groesse, vorschauUrl } from "@/lib/chat/attachments";
import type { Attachment } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/**
 * Eine angehaengte Datei als Zeile -- dieselbe Form im Composer wie spaeter
 * im Verlauf, damit man vor und nach dem Absenden dasselbe sieht.
 *
 * Wieder Haarlinie statt Fuellung: die Chips sitzen direkt ueber dem
 * Eingabefeld, das schon eine Flaeche ist. Zwei Flaechen uebereinander
 * waeren eine zu viel.
 */
function Chip({
  anhang,
  onEntfernen,
}: {
  anhang: Attachment;
  onEntfernen?: () => void;
}) {
  const vorschau = vorschauUrl(anhang);

  return (
    <span className="group/chip relative flex max-w-56 items-center gap-2 rounded-lg py-1.5 pr-2 pl-2 ring-1 ring-border/70 transition-colors ring-inset hover:ring-border">
      {vorschau ? (
        <Image
          src={vorschau}
          alt={anhang.name}
          height={28}
          width={28}
          unoptimized
          className="size-7 shrink-0 rounded-md object-cover ring-1 ring-border/50 ring-inset"
        />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <FileTextIcon className="size-3.5" />
        </span>
      )}

      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[12px] font-medium text-foreground/85">
          {anhang.name}
        </span>
        <span className="truncate text-[10px] text-muted-foreground/60 tabular-nums">
          {groesse(anhang.bytes)}
          {anhang.truncated ? " · truncated" : ""}
        </span>
      </span>

      {onEntfernen ? (
        <button
          type="button"
          onClick={onEntfernen}
          aria-label={`Remove ${anhang.name}`}
          className={cn(
            "absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border transition-[opacity,color] ring-inset",
            "opacity-0 group-hover/chip:opacity-100 hover:text-foreground focus-visible:opacity-100",
            // Ohne Hover kein Kreuz -- auf dem Handy also dauerhaft sichtbar.
            "max-md:opacity-100",
          )}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export function AttachmentChips({
  anhaenge,
  onEntfernen,
  className,
}: {
  anhaenge: Attachment[];
  /** Fehlt sie, sind die Chips nur zum Ansehen -- so im Verlauf. */
  onEntfernen?: (id: string) => void;
  className?: string;
}) {
  if (anhaenge.length === 0) return null;

  return (
    <span className={cn("flex flex-wrap gap-2", className)}>
      {anhaenge.map((anhang) => (
        <Chip
          key={anhang.id}
          anhang={anhang}
          onEntfernen={onEntfernen ? () => onEntfernen(anhang.id) : undefined}
        />
      ))}
    </span>
  );
}
