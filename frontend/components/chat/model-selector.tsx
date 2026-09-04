"use client";

import * as React from "react";
import {
  BrainIcon,
  ChevronsUpDownIcon,
  HardDriveIcon,
  LockIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";

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

type ModelSelectorProps = {
  models: Model[];
  groups?: string[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

const GRUPPEN_ICON: Record<string, React.ElementType> = {
  OpenAI: SparklesIcon,
  Local: HardDriveIcon,
};

const AUFWAND: Record<string, string> = {
  low: "thinks briefly",
  medium: "thinks",
  high: "thinks hard",
  xhigh: "thinks very hard",
  max: "thinks longest",
};

export function ModelSelector({
  models,
  groups,
  value,
  onChange,
  disabled,
}: ModelSelectorProps) {
  const current = models.find((model) => model.id === value) ?? models[0];

  const gebuendelt = React.useMemo(() => {
    const nach = new Map<string, Model[]>();
    for (const model of models) {
      const schluessel = model.group || "Models";
      const vorhanden = nach.get(schluessel);
      if (vorhanden) vorhanden.push(model);
      else nach.set(schluessel, [model]);
    }

    const reihenfolge = [
      ...(groups ?? []).filter((name) => nach.has(name)),
      ...[...nach.keys()].filter((name) => !(groups ?? []).includes(name)),
    ];
    return reihenfolge.map((name) => ({ name, models: nach.get(name)! }));
  }, [models, groups]);

  if (!current) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tour="modell"
        disabled={disabled}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1.5",
          "text-[11px] font-medium text-muted-foreground/80 outline-none",
          "ring-1 ring-transparent transition-all duration-200",
          "hover:bg-accent hover:text-foreground hover:ring-border",
          "aria-expanded:bg-accent aria-expanded:text-foreground aria-expanded:ring-border",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {current.name}
        <ChevronsUpDownIcon className="size-3" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="max-h-[min(28rem,70vh)] w-80 overflow-y-auto"
      >
        <DropdownMenuRadioGroup value={current.id} onValueChange={onChange}>
          {gebuendelt.map((gruppe, index) => {
            const Icon = GRUPPEN_ICON[gruppe.name];
            return (
              <React.Fragment key={gruppe.name}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.09em] text-muted-foreground/50 uppercase">
                  {Icon ? <Icon className="size-3" /> : null}
                  {gruppe.name}
                </DropdownMenuLabel>

                {gruppe.models.map((model) => (
                  <DropdownMenuRadioItem
                    key={model.id}
                    value={model.id}
                    className="flex-col items-start justify-center gap-0.5"
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <span className="text-sm font-medium">{model.name}</span>
                      <Abzeichen model={model} />
                    </span>
                    {model.description ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        {model.description}
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

function Abzeichen({ model }: { model: Model }) {
  const aufwand = model.reasoning_effort
    ? AUFWAND[model.reasoning_effort]
    : undefined;

  return (
    <>
      {aufwand ? (
        <span
          title={aufwand}
          className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary"
        >
          <BrainIcon className="size-2.5" />
          {model.reasoning_effort}
        </span>
      ) : null}

      {model.runtime === "local" ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-px text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
          <ZapIcon className="size-2.5" />
          on device
        </span>
      ) : null}

      {model.gated ? (
        <span
          title="OpenAI has to approve your account for this model first."
          className={cn(
            "ms-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-px",
            "bg-amber-500/10 text-[9px] font-medium text-amber-600 dark:text-amber-400",
          )}
        >
          <LockIcon className="size-2.5" />
          approval
        </span>
      ) : null}
    </>
  );
}
