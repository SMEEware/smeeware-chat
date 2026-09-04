import * as React from "react";
import type { Metadata } from "next";

import { SettingsShell } from "@/components/settings/settings-shell";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Settings",
};

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
