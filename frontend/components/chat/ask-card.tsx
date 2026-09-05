"use client";

import * as React from "react";
import { CornerDownLeftIcon, MessageCircleQuestionIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolArguments } from "@/lib/chat/types";

export type Rueckfrage = {
  question: string;
  options: string[];
};

export function alsRueckfrage(argumente: ToolArguments | undefined): Rueckfrage | null {
  if (!argumente) return null;

  const frage = typeof argumente.question === "string" ? argumente.question.trim() : "";
  if (!frage) return null;

  const roh = argumente.options;
  if (!Array.isArray(roh)) return null;

  const optionen = roh
    .filter((eintrag): eintrag is string => typeof eintrag === "string")
    .map((eintrag) => eintrag.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (optionen.length < 2) return null;
  return { question: frage, options: optionen };
}

export function AskCard({
  frage,
  beantwortet,
  disabled,
  onAntwort,
}: {
  frage: Rueckfrage;
  beantwortet: string | null;
  disabled?: boolean;
  onAntwort: (antwort: string) => void;
}) {
  const [eigene, setEigene] = React.useState("");
  const gesperrt = disabled || beantwortet !== null;

  const abschicken = (antwort: string) => {
    const text = antwort.trim();
    if (!text || gesperrt) return;
    onAntwort(text);
    setEigene("");
  };

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border/70 bg-card/40",
        gesperrt && "opacity-90",
      )}
    >
      <div className="flex items-start gap-2.5 px-4 pt-3.5 pb-3">
        <MessageCircleQuestionIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm leading-relaxed font-medium text-balance">
          {frage.question}
        </p>
      </div>

      <div className="grid gap-1.5 px-3 pb-3 sm:grid-cols-2">
        {frage.options.map((option) => {
          const gewaehlt = beantwortet === option;
          return (
            <button
              key={option}
              type="button"
              disabled={gesperrt}
              onClick={() => abschicken(option)}
              className={cn(
                "group/opt flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-[13px] transition-all",
                gewaehlt
                  ? "border-primary/50 bg-primary/10 font-medium text-primary"
                  : gesperrt
                    ? "border-border/50 text-muted-foreground/50"
                    : "cursor-pointer border-border/60 hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.99]",
                frage.options.length % 2 === 1 &&
                  option === frage.options[frage.options.length - 1] &&
                  "sm:col-span-2",
              )}
            >
              <span className="flex-1 text-pretty">{option}</span>
              {gewaehlt ? null : (
                <CornerDownLeftIcon className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover/opt:text-muted-foreground/50" />
              )}
            </button>
          );
        })}
      </div>

      {beantwortet !== null && !frage.options.includes(beantwortet) ? (
        <p className="border-t border-border/50 px-4 py-2.5 text-[13px] text-muted-foreground">
          <span className="text-[11px] text-muted-foreground/60">Your answer: </span>
          {beantwortet}
        </p>
      ) : null}

      {beantwortet === null ? (
        <div className="flex items-center gap-2 border-t border-border/50 bg-muted/20 px-3 py-2">
          <input
            value={eigene}
            disabled={gesperrt}
            onChange={(event) => setEigene(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                abschicken(eigene);
              }
            }}
            placeholder="Or write your own answer…"
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/45"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={gesperrt || !eigene.trim()}
            onClick={() => abschicken(eigene)}
            className="h-7 shrink-0 px-2.5 text-xs"
          >
            Send
          </Button>
        </div>
      ) : null}
    </div>
  );
}
