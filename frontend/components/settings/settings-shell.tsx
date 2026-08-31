"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRoundIcon, PaletteIcon, UserIcon } from "lucide-react";

import { useAccount } from "@/hooks/use-account";
import { cn } from "@/lib/utils";
import { AccountSection } from "@/components/settings/account-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { AppearanceSection } from "@/components/settings/appearance-section";

type Abschnitt = "account" | "keys" | "appearance";

const NAV: { id: Abschnitt; label: string; icon: React.ElementType }[] = [
  { id: "account", label: "Account", icon: UserIcon },
  { id: "keys", label: "API keys", icon: KeyRoundIcon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
];

function istAbschnitt(wert: string | null): wert is Abschnitt {
  return wert === "account" || wert === "keys" || wert === "appearance";
}

/**
 * Die General Settings -- linke Navigation, rechts der Inhalt.
 *
 * Der offene Abschnitt steht in der Adresse (``?section=keys``): so kann die
 * Landing-Page direkt auf die Schluessel zeigen, und ein Neuladen bleibt am
 * selben Ort. Die Anmeldung prueft die Seite selbst -- wer nicht angemeldet
 * ist, hat hier nichts zu sehen und wird zur Anmeldung geschickt.
 */
export function SettingsShell() {
  const konto = useAccount();
  const router = useRouter();
  const params = useSearchParams();

  const roh = params.get("section");
  const aktiv: Abschnitt = istAbschnitt(roh) ? roh : "account";

  // Nicht angemeldet -> zur Anmeldung, mit dem Rueckweg im Gepaeck.
  React.useEffect(() => {
    if (konto.isSuccess && !konto.data.authenticated) {
      const ziel = `/settings${aktiv === "account" ? "" : `?section=${aktiv}`}`;
      router.replace(`/login?next=${encodeURIComponent(ziel)}`);
    }
  }, [konto.isSuccess, konto.data?.authenticated, aktiv, router]);

  const waehle = (id: Abschnitt) => {
    const suffix = id === "account" ? "" : `?section=${id}`;
    router.replace(`/settings${suffix}`);
  };

  if (konto.isLoading || (konto.isSuccess && !konto.data.authenticated)) {
    return (
      <div className="flex flex-1 items-center justify-center py-32 text-[13px] text-muted-foreground/60">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10 md:flex-row md:gap-12 md:py-14">
      {/* Linke Navigation. Auf schmalen Fenstern eine waagerechte Leiste, die
          quer scrollt, statt drei Zeilen zu stapeln. */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible">
        {NAV.map((eintrag) => {
          const an = eintrag.id === aktiv;
          return (
            <button
              key={eintrag.id}
              type="button"
              onClick={() => waehle(eintrag.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                an
                  ? "bg-primary/[0.08] text-foreground ring-1 ring-primary/20 ring-inset"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <eintrag.icon
                className={cn(
                  "size-4 shrink-0",
                  an ? "text-primary" : "text-muted-foreground/60",
                )}
              />
              {eintrag.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {aktiv === "account" ? <AccountSection /> : null}
        {aktiv === "keys" ? <ApiKeysSection /> : null}
        {aktiv === "appearance" ? <AppearanceSection /> : null}
      </div>
    </div>
  );
}
