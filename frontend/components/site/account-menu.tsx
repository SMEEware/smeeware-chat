"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  KeyRoundIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountKey, useAccount } from "@/hooks/use-account";

/**
 * Das Konto im Kopf der Seite.
 *
 * Solange niemand angemeldet ist, ist es schlicht der "Open chat"-Knopf wie
 * bisher -- ein Avatar ohne Konto dahinter waere eine leere Geste. Ist
 * jemand angemeldet, wird daraus sein Bild mit einem Menue: der eine Ort,
 * von dem aus man in die Einstellungen, in die Doku und wieder hinaus
 * kommt.
 */
export function AccountMenu() {
  const konto = useAccount();
  const router = useRouter();
  const client = useQueryClient();

  const abmelden = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    // Der Cache haelt sonst den alten "angemeldet"-Zustand fest und die
    // Anmeldeseite schickt einen gerade Abgemeldeten sofort weiter.
    client.setQueryData(accountKey, (alt: unknown) =>
      alt && typeof alt === "object"
        ? { ...(alt as object), authenticated: false }
        : alt,
    );
    router.push("/login");
  };

  // Noch nicht geladen oder nicht angemeldet: der gewohnte CTA.
  if (!konto.data?.authenticated) {
    return (
      <Button
        size="sm"
        nativeButton={false}
        render={<Link href="/chat">Open chat</Link>}
      />
    );
  }

  const name = konto.data.username ?? "Account";
  const initiale = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="group flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-border/70 transition-[box-shadow,transform] ring-inset hover:ring-primary/45 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none active:scale-95 data-[popup-open]:ring-primary/50"
      >
        {konto.data.has_avatar ? (
          <Image
            key={konto.dataUpdatedAt}
            src={`/api/account/avatar?v=${konto.dataUpdatedAt}`}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-primary/10 text-[13px] font-semibold text-primary">
            {initiale}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
            {konto.data.has_avatar ? (
              <Image
                src={`/api/account/avatar?v=${konto.dataUpdatedAt}`}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="size-full object-cover"
              />
            ) : (
              <UserIcon className="size-4" />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {name}
            </span>
            <span className="text-[11px] font-normal text-muted-foreground/60">
              Signed in
            </span>
          </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/settings" />}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings?section=keys" />}>
          <KeyRoundIcon />
          API keys
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/docs" />}>
          <BookOpenIcon />
          Documentation
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={abmelden}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
