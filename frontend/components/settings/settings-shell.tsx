"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRoundIcon, PaletteIcon, UserIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAccount } from "@/hooks/use-account";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import { AccountSection } from "@/components/settings/account-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { AppearanceSection } from "@/components/settings/appearance-section";

type Section = "account" | "keys" | "appearance";

function isSection(value: string | null): value is Section {
  return value === "account" || value === "keys" || value === "appearance";
}

export function SettingsShell() {
  const t = useT();
  const account = useAccount();
  const router = useRouter();
  const params = useSearchParams();

  const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
    { id: "account", label: t("settings.navAccount"), icon: UserIcon },
    { id: "keys", label: t("settings.navKeys"), icon: KeyRoundIcon },
    { id: "appearance", label: t("settings.navAppearance"), icon: PaletteIcon },
  ];

  const raw = params.get("section");
  const active: Section = isSection(raw) ? raw : "account";

  React.useEffect(() => {
    if (account.isSuccess && !account.data.authenticated) {
      const target = `/settings${active === "account" ? "" : `?section=${active}`}`;
      router.replace(`/login?next=${encodeURIComponent(target)}`);
    }
  }, [account.isSuccess, account.data?.authenticated, active, router]);

  const select = (id: Section) => {
    const suffix = id === "account" ? "" : `?section=${id}`;
    router.replace(`/settings${suffix}`);
  };

  if (account.isLoading || (account.isSuccess && !account.data.authenticated)) {
    return (
      <div className="flex flex-1 items-center justify-center py-32 text-[13px] text-muted-foreground/60">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10 md:flex-row md:gap-12 md:py-14">
      <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible">
        {NAV.map((entry) => {
          const isActive = entry.id === active;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => select(entry.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-primary/[0.08] text-foreground ring-1 ring-primary/20 ring-inset"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <entry.icon
                className={cn(
                  "size-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground/60",
                )}
              />
              {entry.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {active === "account" ? <AccountSection /> : null}
        {active === "keys" ? <ApiKeysSection /> : null}
        {active === "appearance" ? <AppearanceSection /> : null}
      </div>
    </div>
  );
}
