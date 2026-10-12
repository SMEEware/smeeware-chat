import * as React from "react";
import type { Metadata } from "next";

import { SettingsShell } from "@/components/settings/settings-shell";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.metaTitle") };
}

export default async function SettingsPage() {
  const { t } = await getI18n();
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <React.Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center py-32 text-[13px] text-muted-foreground/60">
            {t("common.loading")}
          </div>
        }
      >
        <SettingsShell />
      </React.Suspense>
      <SiteFooter />
    </div>
  );
}
