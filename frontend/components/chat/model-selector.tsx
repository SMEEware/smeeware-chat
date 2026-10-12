"use client";

import * as React from "react";
import {
  BrainCircuitIcon,
  BrainIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  HardDriveIcon,
  LockIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const modelIcon = (model: Model) =>
  model.runtime === "local" ? HardDriveIcon : BrainCircuitIcon;

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
  }, [models, groups]);

  if (!current) return null;

  const CurrentIcon = modelIcon(current);
  const chip = variant === "chip";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
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
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={chip ? "start" : "end"}
        side={chip ? "top" : undefined}
        className="max-h-[min(28rem,70vh)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuRadioGroup value={current.id} onValueChange={onChange}>
          {bundled.map((group, index) => {
            const Icon = GROUP_ICON[group.name];
            return (
              <React.Fragment key={group.name}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.09em] text-muted-foreground/50 uppercase">
                  {Icon ? <Icon className="size-3" /> : null}
                  {group.name}
                </DropdownMenuLabel>

                {group.models.map((model) => (
                  <DropdownMenuRadioItem
                    key={model.id}
                    value={model.id}
                    className="flex-col items-start justify-center gap-0.5"
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <span className="text-sm font-medium">{model.name}</span>
                      <ModelBadge model={model} />
                    </span>
                    {model.description ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        {describe(t, model)}
                      </span>
                    ) : null}
                  </DropdownMenuRadioItem>
                ))}
              </React.Fragment>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelBadge({ model }: { model: Model }) {
  const t = useT();
  const effort = model.reasoning_effort
    ? effortLabel(t, model.reasoning_effort)
    : undefined;

  return (
    <>
      {effort ? (
        <span
          title={effort}
          className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary"
        >
          <BrainIcon className="size-2.5" />
          {t(`modelSelector.effortShort.${model.reasoning_effort}`)}
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
