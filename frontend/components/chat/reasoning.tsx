"use client";

import * as React from "react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { cn } from "@/lib/utils";

type ReasoningProps = {
  reasoning: string;
  streaming: boolean;
  thinking: boolean;
  durationMs?: number;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function Reasoning({
  reasoning,
  streaming,
  thinking,
  durationMs,
}: ReasoningProps) {
  const tailRef = React.useRef<HTMLDivElement>(null);

  const clean = stripToolScaffolding(reasoning);

  React.useEffect(() => {
    if (!thinking) return;
    const tail = tailRef.current;
    if (tail) tail.scrollTop = tail.scrollHeight;
  }, [reasoning, thinking]);

  if (thinking) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <BrainIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shimmer text-muted-foreground">thinking</span>
        </div>

        {clean ? (
          <div
            ref={tailRef}
            aria-hidden
            className="scroll-fade-t no-scrollbar max-h-24 overflow-y-auto overscroll-contain text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground/55"
          >
            {clean}
          </div>
        ) : null}
      </div>
    );
  }

  if (!clean) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger
        className={cn(
          "group/reasoning flex items-center gap-1.5 rounded-full text-xs font-medium text-muted-foreground",
          "transition-colors outline-none hover:text-foreground focus-visible:text-foreground",
        )}
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span>Reasoning</span>
        {durationMs ? (
          <span className="text-muted-foreground/60">
            · {seconds(durationMs)}
          </span>
        ) : null}
        {streaming ? <span className="shimmer">· running</span> : null}
        <ChevronDownIcon className="size-3.5 shrink-0 transition-transform duration-200 group-data-panel-open/reasoning:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent
        className={cn(
          "h-(--collapsible-panel-height) overflow-hidden",
          "transition-[height] duration-250 ease-out",
          "data-starting-style:h-0 data-ending-style:h-0",
        )}
      >
        <div className="mt-2 border-s border-border ps-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground/70">
          {clean}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
