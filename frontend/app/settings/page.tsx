import * as React from "react";
import type { Metadata } from "next";

import { SettingsShell } from "@/components/settings/settings-shell";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Die General Settings als eigene Seite -- Account und API-Schluessel.
 *
 * Bewusst getrennt vom Chat: der Chat-Dialog traegt nur noch, was beim
 * Tippen zaehlt (Denken, Werkzeuge, Personas). Alles rund um das Konto und
 * den Zugang von aussen lebt hier, erreichbar ueber das Avatar-Menue im
 * Kopf und ueber den Link von der Landing-Page.
 *
 * ``SettingsShell`` liest den Abschnitt aus der Adresse und braucht deshalb
 * eine Suspense-Grenze -- ohne sie verlangt Next fuers Vorrendern, dass die
 * ganze Seite dynamisch wird.
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <React.Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center py-32 text-[13px] text-muted-foreground/60">
            Loading…
          </div>
        }
      >
        <SettingsShell />
      </React.Suspense>
      <SiteFooter />
    </div>
  );
}
