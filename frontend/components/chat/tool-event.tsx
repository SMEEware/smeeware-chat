"use client";

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  PlugZapIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ImageGeneration } from "@/components/chat/image-generation";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useAktuellerBildlauf } from "@/lib/chat/image-runs";
import type { ToolArguments, ToolPart } from "@/lib/chat/types";

function summariseArgs(args?: ToolArguments): string {
  if (!args) return "";
  return Object.entries(args)
    .map(([key, value]) => {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return `${key}=${text}`;
    })
    .join(" · ");
}

export function ToolEvent({
  part,
  unterbrochen = false,
}: {
  part: ToolPart;
  unterbrochen?: boolean;
}) {
  const running = part.status === "running" && !unterbrochen;
  const abgerissen = part.status === "running" && unterbrochen;
  const failed = part.status === "error";
  const argsLine = summariseArgs(part.arguments);
  const hasDetail = Boolean(part.preview);

  const bild = useAktuellerBildlauf(running && part.tool === "generate_image");

  const header = (
    <>
      <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono text-xs font-medium">{part.tool}</span>

      {argsLine ? (
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground/70">
          {argsLine}
        </span>
      ) : (
        <span className="flex-1" />
      )}

      <span className="shrink-0">
        {running ? (
          <Spinner className="size-3.5 text-muted-foreground" />
        ) : abgerissen ? (
          <PlugZapIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
        ) : failed ? (
          <XIcon className="size-3.5 text-destructive" />
        ) : (
          <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        )}
      </span>
    </>
  );

  const shell =
    "flex w-fit max-w-full items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2";

  if (!hasDetail) {
    if (bild !== null) {
      return (
        <div className="flex w-fit max-w-full flex-col gap-2">
          <div className={cn(shell, "animate-pulse")}>{header}</div>
          <ImageGeneration lauf={bild} />
        </div>
      );
    }
    return (
      <div className={cn(shell, running && "animate-pulse")}>{header}</div>
    );
  }

  return (
    <Collapsible
      className={cn(
        "w-fit max-w-full rounded-2xl border bg-muted/40",
        failed && "border-destructive/30",
      )}
    >
      <CollapsibleTrigger className="group/tool flex w-full items-center gap-2 px-3 py-2 outline-none">
        {header}
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open/tool:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent
        className={cn(
          "h-(--collapsible-panel-height) overflow-hidden",
          "transition-[height] duration-250 ease-out",
          "data-starting-style:h-0 data-ending-style:h-0",
        )}
      >
        <div className="border-t px-3 py-2">
          <p
            className={cn(
              "text-xs leading-relaxed wrap-break-word whitespace-pre-wrap",
              failed ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {part.preview}
          </p>
          {typeof part.length === "number" ? (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
              {part.length.toLocaleString("en-US")} characters
            </p>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
