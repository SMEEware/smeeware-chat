"use client";

import * as React from "react";
import { CornerDownLeftIcon, MessageCircleQuestionIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { ToolArguments } from "@/lib/chat/types";

export type AskRequest = {
  question: string;
  options: string[];
};

export function asAskRequest(toolArgs: ToolArguments | undefined): AskRequest | null {
  if (!toolArgs) return null;

  const question = typeof toolArgs.question === "string" ? toolArgs.question.trim() : "";
  if (!question) return null;

  const raw = toolArgs.options;
  if (!Array.isArray(raw)) return null;

  const options = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (options.length < 2) return null;
  return { question, options };
}

export function AskCard({
  question,
  answered,
  disabled,
  onAnswer,
}: {
  question: AskRequest;
  answered: string | null;
  disabled?: boolean;
  onAnswer: (response: string) => void;
}) {
  const t = useT();
  const [custom, setCustom] = React.useState("");
  const locked = disabled || answered !== null;

  const send = (response: string) => {
    const text = response.trim();
    if (!text || locked) return;
    onAnswer(text);
    setCustom("");
  };

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border/70 bg-card/40",
        locked && "opacity-90",
      )}
    >
      <div className="flex items-start gap-2.5 px-4 pt-3.5 pb-3">
        <MessageCircleQuestionIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm leading-relaxed font-medium text-balance">
          {question.question}
        </p>
      </div>

      <div className="grid gap-1.5 px-3 pb-3 sm:grid-cols-2">
        {question.options.map((option) => {
          const selected = answered === option;
          return (
            <button
              key={option}
              type="button"
              disabled={locked}
              onClick={() => send(option)}
              className={cn(
                "group/opt flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-[13px] transition-all",
                selected
                  ? "border-primary/50 bg-primary/10 font-medium text-primary"
                  : locked
                    ? "border-border/50 text-muted-foreground/50"
                    : "cursor-pointer border-border/60 hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.99]",
                question.options.length % 2 === 1 &&
                  option === question.options[question.options.length - 1] &&
                  "sm:col-span-2",
              )}
            >
              <span className="flex-1 text-pretty">{option}</span>
              {selected ? null : (
                <CornerDownLeftIcon className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover/opt:text-muted-foreground/50" />
              )}
            </button>
          );
        })}
      </div>

      {answered !== null && !question.options.includes(answered) ? (
        <p className="border-t border-border/50 px-4 py-2.5 text-[13px] text-muted-foreground">
          <span className="text-[11px] text-muted-foreground/60">{t("ask.yourAnswer")}</span>
          {answered}
        </p>
      ) : null}

      {answered === null ? (
        <div className="flex items-center gap-2 border-t border-border/50 bg-muted/20 px-3 py-2">
          <input
            value={custom}
            disabled={locked}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(custom);
              }
            }}
            placeholder={t("ask.writeOwn")}
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/45"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={locked || !custom.trim()}
            onClick={() => send(custom)}
            className="h-7 shrink-0 px-2.5 text-xs"
          >
            {t("ask.send")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
