"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/settings/section-parts";
import { useLocale, useSetLocale, useT } from "@/context/i18n-provider";
import { locales, localeNames, type Locale } from "@/lib/i18n/config";

export function AppearanceSection() {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const themeOptions = [
    { value: "system", label: t("settings.appearance.themeSystem"), icon: MonitorIcon },
    { value: "light", label: t("settings.appearance.themeLight"), icon: SunIcon },
    { value: "dark", label: t("settings.appearance.themeDark"), icon: MoonIcon },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <SectionHeader
          title={t("settings.appearance.title")}
          text={t("settings.appearance.text")}
        />

        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((o) => {
            const active = ready && theme === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTheme(o.value)}
                className={cn(
                  "group relative flex flex-col items-center gap-2 rounded-2xl border p-5 transition-colors",
                  active
                    ? "border-primary/40 bg-primary/[0.06]"
                    : "border-border/60 bg-card/40 hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted/60 text-muted-foreground",
                  )}
                >
                  <o.icon className="size-4" />
                </span>
                <span className="text-[12px] font-medium">{o.label}</span>
                <span
                  className={cn(
                    "absolute top-2 right-2 text-primary transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                >
                  <CheckIcon className="size-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader
          title={t("settings.appearance.language")}
          text={t("settings.appearance.languageText")}
        />

        <div className="grid grid-cols-2 gap-3">
          {locales.map((code: Locale) => {
            const active = locale === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                className={cn(
                  "group relative flex items-center justify-between rounded-2xl border p-4 transition-colors",
                  active
                    ? "border-primary/40 bg-primary/[0.06]"
                    : "border-border/60 bg-card/40 hover:border-border",
                )}
              >
                <span className="flex flex-col items-start">
                  <span className="text-[13px] font-medium">
                    {localeNames[code]}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60 uppercase">
                    {code}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-primary transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                >
                  <CheckIcon className="size-4" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
