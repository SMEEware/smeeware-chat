"use client";

import * as React from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";

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
    <div className="flex w-full flex-col items-end gap-1">
      <Bubble variant="muted" align="end" className="min-w-[min(13rem,100%)]">
        <BubbleContent className="rounded-ee-lg px-4 py-3">
          <span className="relative block">
            <span
              className="block overflow-hidden transition-[max-height] duration-300 ease-out"
              style={collapsed ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
            >
              <span
                ref={innerRef}
                className="block whitespace-pre-wrap wrap-break-words"
              >
                {content}
              </span>
            </span>

            {collapsed ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-muted to-transparent"
              />
            ) : null}
          </span>
        </BubbleContent>
      </Bubble>

      <span className="flex items-center gap-1">
        {overflows ? (
          <button
            type="button"
            onClick={() => setExpanded((previous) => !previous)}
            className="cursor-pointer rounded px-1 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
        {copySlot}
      </span>
    </div>
  );
}
