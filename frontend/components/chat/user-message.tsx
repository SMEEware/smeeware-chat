"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COLLAPSED_MAX_PX = 46;

const ESTIMATED_LIMIT = 140;

export function UserMessage({
  content,
  copySlot,
}: {
  content: string;
  copySlot?: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(
    () => content.length > ESTIMATED_LIMIT,
  );
  const innerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const observer = new ResizeObserver(() => {
      setOverflows(inner.scrollHeight > COLLAPSED_MAX_PX + 1);
    });

    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const collapsed = overflows && !expanded;

  return (
    <Bubble
      variant="outline"
      align="end"
      className="min-w-[min(13rem,100%)]"
    >
      <BubbleContent className="px-4 py-3">
        <span
          className="block overflow-hidden transition-[max-height] duration-200"
          style={collapsed ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
        >
          <span
            ref={innerRef}
            className="block whitespace-pre-wrap wrap-break-words"
          >
            {content}
          </span>
        </span>

        {overflows ? (
          <span className="mt-2 flex items-center gap-1 border-t pt-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((previous) => !previous)}
              className="-ms-2 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDownIcon
                className={cn("transition-transform", expanded && "rotate-180")}
              />
              {expanded ? "Collapse" : "Expand"}
            </Button>

            <span className="-me-2 ms-auto">{copySlot}</span>
          </span>
        ) : null}
      </BubbleContent>
    </Bubble>
  );
}
