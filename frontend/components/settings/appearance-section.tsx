"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/settings/section-parts";

const OPTIONEN = [
  { wert: "system", label: "System", icon: MonitorIcon },
  { wert: "light", label: "Light", icon: SunIcon },
  { wert: "dark", label: "Dark", icon: MoonIcon },
] as const;

/**
 * Das Aussehen -- hell, dunkel, oder was das Betriebssystem sagt.
 *
 * Erst nach dem Einhaengen echte Werte: ``next-themes`` kennt die Wahl auf
 * dem Server nicht, und ein vorab gerendertes Haekchen saesse sonst kurz am
 * falschen Feld.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [bereit, setBereit] = React.useState(false);
  React.useEffect(() => {
    // Nicht synchron im Effekt-Rumpf: ein Frame Vorlauf, dann steht die
    // Wahl fest -- vorher kennt next-themes sie nicht.
    const id = requestAnimationFrame(() => setBereit(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        titel="Appearance"
        text="How this site looks on this device. Kept in your browser, not your account."
      />

      <div className="grid grid-cols-3 gap-3">
        {OPTIONEN.map((o) => {
          const aktiv = bereit && theme === o.wert;
          return (
            <button
              key={o.wert}
              type="button"
              onClick={() => setTheme(o.wert)}
              className={cn(
                "group relative flex flex-col items-center gap-2 rounded-2xl border p-5 transition-colors",
                aktiv
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-border/60 bg-card/40 hover:border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg transition-colors",
                  aktiv
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
                  aktiv ? "opacity-100" : "opacity-0",
                )}
              >
                <CheckIcon className="size-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
