"use client";

import * as React from "react";
import {
  BrainCircuitIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  HardDriveIcon,
  LockIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Slider } from "@base-ui/react/slider";

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useModelOverride } from "@/lib/chat/model-store";
import { chosenReasoningEffort, supportedReasoningEfforts } from "@/lib/chat/reasoning";
import type { Model } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

type ModelSelectorProps = {
  models: Model[];
  groups?: string[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  variant?: "inline" | "chip";
};

const GROUP_ICON: Record<string, LucideIcon> = {
  OpenAI: SparklesIcon,
  Local: HardDriveIcon,
};

function describe(t: TranslateFn, model: Model): string {
  const key =
    model.runtime === "local"
      ? "modelSelector.descriptions.local"
      : `modelSelector.descriptions.${model.id.replaceAll(".", "_")}`;
  const text = t(key);
  return text === key ? model.description : text;
}

function effortLabel(t: TranslateFn, effort: string): string | undefined {
  const map: Record<string, string> = {
    none: t("modelSelector.effortNone"),
    minimal: t("modelSelector.effortMinimal"),
    low: t("modelSelector.effortLow"),
    medium: t("modelSelector.effortMedium"),
    high: t("modelSelector.effortHigh"),
    xhigh: t("modelSelector.effortXhigh"),
    max: t("modelSelector.effortMax"),
  };
  return map[effort];
}

export function ModelSelector({
  models,
  groups,
  value,
  onChange,
  disabled,
  variant = "inline",
}: ModelSelectorProps) {
  const t = useT();
  const current = models.find((model) => model.id === value) ?? models[0];
  const preferences = useModelOverride((state) => state.reasoningEfforts);
  const setReasoningEffort = useModelOverride((state) => state.setReasoningEffort);

  const bundled = React.useMemo(() => {
    const grouped = new Map<string, Model[]>();
    for (const model of models) {
      const apiKey = model.group || t("modelSelector.modelsGroup");
      const existing = grouped.get(apiKey);
      if (existing) existing.push(model);
      else grouped.set(apiKey, [model]);
    }

    const order = [
      ...(groups ?? []).filter((name) => grouped.has(name)),
      ...[...grouped.keys()].filter((name) => !(groups ?? []).includes(name)),
    ];
    return order.map((name) => ({ name, models: grouped.get(name)! }));
  }, [models, groups, t]);

  if (!current) return null;

  const CurrentIcon = current.runtime === "local" ? HardDriveIcon : BrainCircuitIcon;
  const chip = variant === "chip";

  return (
    <Popover>
      <PopoverTrigger
        data-tour="model"
        disabled={disabled}
        aria-label={t("modelSelector.choose", { name: current.name })}
        title={t("modelSelector.choose", { name: current.name })}
        className={cn(
          "group/model inline-flex min-w-0 cursor-pointer items-center outline-none",
          "transition-all duration-200 disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          chip
            ? [
                "h-9 max-w-full gap-2 rounded-full py-1 ps-1 pe-3",
                "bg-card/70 backdrop-blur-xl supports-backdrop-filter:bg-card/55",
                "text-[13px] font-medium text-foreground/90",
                "shadow-lg shadow-black/5 ring-1 ring-border/70 dark:shadow-black/30",
                "active:scale-[0.97] aria-expanded:ring-primary/40",
              ]
            : [
                "gap-1.5 rounded-full px-2.5 py-1.5",
                "text-[11px] font-medium text-muted-foreground/80",
                "ring-1 ring-transparent",
                "hover:bg-accent hover:text-foreground hover:ring-border",
                "aria-expanded:bg-accent aria-expanded:text-foreground aria-expanded:ring-border",
              ],
        )}
      >
        {chip ? (
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full",
              current.runtime === "local"
                ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                : "bg-primary/12 text-primary",
            )}
          >
            <CurrentIcon className="size-3.5" />
          </span>
        ) : (
          <CurrentIcon className="size-3.5 opacity-70" />
        )}
        <span className="truncate">{current.name}</span>
        {chip ? (
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded/model:rotate-180" />
        ) : (
          <ChevronsUpDownIcon className="size-3 shrink-0" />
        )}
      </PopoverTrigger>

      <PopoverContent
        align={chip ? "start" : "end"}
        side={chip ? "top" : undefined}
        sideOffset={8}
        className="max-h-[min(38rem,75dvh,var(--available-height))] w-[min(23rem,calc(100vw-2rem))] gap-0 overflow-hidden p-1.5"
      >
        <PopoverTitle className="sr-only">{t("modelSelector.modelsGroup")}</PopoverTitle>
        <RadioGroup
          value={current.id}
          onValueChange={(id) => { if (typeof id === "string") onChange(id); }}
          aria-label={t("modelSelector.modelsGroup")}
          disabled={disabled}
          className="min-h-0 overflow-y-auto overscroll-contain"
        >
          {bundled.map((group, index) => {
            const Icon = GROUP_ICON[group.name];
            return (
              <div key={group.name}>
                {index > 0 ? <div className="mx-3 my-1.5 h-px bg-border/50" /> : null}
                <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                  {Icon ? <Icon className="size-3" /> : null}
                  {group.name}
                </div>

                {group.models.map((model) => (
                  <Radio.Root
                    key={model.id}
                    value={model.id}
                    aria-label={model.name}
                    className={cn(
                      "group/choice relative flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 outline-none",
                      "transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                      "data-checked:bg-primary/6 data-disabled:pointer-events-none data-disabled:opacity-50",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-medium">{model.name}</span>
                        <ModelBadge model={model} preference={preferences[model.id]} />
                      </span>
                      {model.description ? (
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                          {describe(t, model)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-border transition-colors group-data-checked/choice:bg-primary group-data-checked/choice:text-primary-foreground group-data-checked/choice:ring-primary">
                      <Radio.Indicator keepMounted className="opacity-0 data-checked:opacity-100">
                        <CheckIcon className="size-3" strokeWidth={2.5} />
                      </Radio.Indicator>
                    </span>
                  </Radio.Root>
                ))}
              </div>
            );
          })}
        </RadioGroup>
        <ReasoningControl
          key={current.id}
          model={current}
          preference={preferences[current.id]}
          disabled={disabled}
          onChange={(effort) => setReasoningEffort(current.id, effort)}
        />
      </PopoverContent>
    </Popover>
  );
}

function ModelBadge({ model, preference }: { model: Model; preference?: string }) {
  const t = useT();
  const selected = chosenReasoningEffort(model, preference) ?? model.reasoning_effort;
  const effort = selected ? effortLabel(t, selected) : undefined;

  return (
    <>
      {effort ? (
        <span
          title={effort}
          className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary"
        >
          <BrainIcon className="size-2.5" />
          {shortEffort(t, selected!)}
        </span>
      ) : null}

      {model.runtime === "local" ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-px text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
          <ZapIcon className="size-2.5" />
          {t("modelSelector.onDevice")}
        </span>
      ) : null}

      {model.gated ? (
        <span
          title={t("modelSelector.gatedTitle")}
          className={cn(
            "ms-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-px",
            "bg-amber-500/10 text-[9px] font-medium text-amber-600 dark:text-amber-400",
          )}
        >
          <LockIcon className="size-2.5" />
          {t("modelSelector.gated")}
        </span>
      ) : null}
    </>
  );
}

function shortEffort(t: TranslateFn, effort: string): string {
  const key = `modelSelector.effortShort.${effort}`;
  const label = t(key);
  return label === key ? effort : label;
}

function ReasoningControl({
  model,
  preference,
  disabled,
  onChange,
}: {
  model: Model;
  preference?: string;
  disabled?: boolean;
  onChange: (effort: string) => void;
}) {
  const t = useT();
  const labelId = React.useId();
  const hintId = React.useId();
  const efforts = supportedReasoningEfforts(model);
  const effort = chosenReasoningEffort(model, preference);
  if (efforts.length < 2 || !effort) return null;

  const index = efforts.indexOf(effort);
  const levelLabel = shortEffort(t, effort);

  return (
    <div className="mt-1.5 shrink-0 border-t border-border/60 px-3 pb-3 pt-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span id={labelId} className="flex items-center gap-2 text-xs font-medium">
          <BrainIcon aria-hidden className="size-3.5 text-muted-foreground" />
          {t("modelSelector.thinking")}
        </span>
        <span className="rounded-lg bg-primary/8 px-2 py-1 text-[11px] font-medium text-primary">
          {levelLabel}
        </span>
      </div>
      <p id={hintId} className="text-[11px] leading-relaxed text-muted-foreground">
        {t("modelSelector.thinkingHint")}
      </p>
      <Slider.Root
        min={0}
        max={efforts.length - 1}
        step={1}
        largeStep={1}
        value={index}
        disabled={disabled}
        onValueChange={(next) => {
          const selected = efforts[Array.isArray(next) ? next[0] : next];
          if (selected) onChange(selected);
        }}
        className="group/effort mt-3 w-full data-disabled:opacity-50"
      >
        <Slider.Control className="relative flex h-9 w-full touch-none cursor-pointer items-center select-none">
          <Slider.Track className="relative h-2 w-full rounded-full bg-input/70 ring-1 ring-foreground/4 ring-inset">
            <Slider.Indicator className="h-full rounded-full bg-primary" />
            <span aria-hidden className="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center justify-between">
              {efforts.map((step, position) => (
                <span
                  key={step}
                  className={cn(
                    "mx-0.5 size-1 rounded-full",
                    position <= index ? "bg-primary-foreground/40" : "bg-foreground/20",
                  )}
                />
              ))}
            </span>
          </Slider.Track>
          <Slider.Thumb
            aria-labelledby={labelId}
            aria-describedby={hintId}
            getAriaValueText={(_formatted, next) => shortEffort(t, efforts[next] ?? effort)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full border border-border bg-popover shadow-[0_2px_6px_#0002,0_0_0_3px_var(--popover)]",
              "outline-none transition-[box-shadow,scale] duration-150 hover:scale-110 focus-visible:ring-4 focus-visible:ring-ring/40",
              "data-dragging:scale-110 data-dragging:cursor-grabbing motion-reduce:transition-none",
            )}
          >
            <span aria-hidden className="flex items-center gap-0.5">
              <span className="h-2 w-px rounded-full bg-foreground/25" />
              <span className="h-3 w-px rounded-full bg-foreground/45" />
              <span className="h-2 w-px rounded-full bg-foreground/25" />
            </span>
          </Slider.Thumb>
        </Slider.Control>
      </Slider.Root>
      <div aria-hidden className="flex justify-between text-[10px] text-muted-foreground">
        <span>{t("modelSelector.thinkingLess")}</span>
        <span>{t("modelSelector.thinkingMore")}</span>
      </div>
    </div>
  );
}
