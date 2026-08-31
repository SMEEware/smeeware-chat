"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Zwei Zeilen: text-sm auf leading-relaxed sind 14px * 1.625 = 22.75px.
 * Die Konstante steuert Kuerzung und Messung gleichermassen, damit die
 * beiden nicht auseinanderlaufen koennen.
 */
const COLLAPSED_MAX_PX = 46;

/**
 * Der Beobachter misst erst nach dem ersten Layout. Damit eine lange
 * Nachricht nicht kurz in voller Hoehe aufblitzt, wird vorab geschaetzt --
 * zwei Zeilen sind in der Blase grob 140 Zeichen. Die Messung korrigiert
 * das anschliessend in beide Richtungen.
 */
const ESTIMATED_LIMIT = 140;

/**
 * Eigene Nachrichten koennen sehr lang sein -- ein hineinkopiertes Log
 * schiebt sonst den ganzen Verlauf aus dem Bild. Ueber der Schwelle
 * bleiben zwei Zeilen stehen, der Rest kommt per Knopf.
 */
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

    // Gemessen wird der ungekuerzte Inhalt gegen die feste Schwelle --
    // nicht der sichtbare Ausschnitt. Sonst meldet der ausgeklappte
    // Zustand "passt schon" und der Knopf verschwindet.
    const observer = new ResizeObserver(() => {
      setOverflows(inner.scrollHeight > COLLAPSED_MAX_PX + 1);
    });

    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const collapsed = overflows && !expanded;

  return (
    <Bubble variant="outline" align="end">
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

        {/* Nur bei gekuerzten Nachrichten -- unter einem Einzeiler
            waere die Leiste schwerer als der Inhalt. */}
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
