import * as React from "react";

import { cn } from "@/lib/utils";

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
