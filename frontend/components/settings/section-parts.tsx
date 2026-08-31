import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Die kleinen, geteilten Bausteine der Einstellungsseite.
 *
 * An einer Stelle, damit Account- und Schluessel-Abschnitt dieselbe Sprache
 * sprechen: dieselbe Ueberschrift, dieselbe Kartenkante. Eine Kopie je
 * Abschnitt liefe frueher oder spaeter auseinander.
 */

export function SectionHeader({
  titel,
  text,
}: {
  titel: string;
  text: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-heading text-lg font-semibold tracking-tight">
        {titel}
      </h2>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

export function SectionCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/40 p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
