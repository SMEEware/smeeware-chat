"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  KeyRoundIcon,
  LockIcon,
  LockOpenIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";

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
import { useT } from "@/context/i18n-provider";

export function AccountMenu() {
  const t = useT();
  const account = useAccount();
  const router = useRouter();
  const client = useQueryClient();

  const signOut = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    client.setQueryData(accountKey, (alt: unknown) =>
      alt && typeof alt === "object"
        ? { ...(alt as object), authenticated: false }
        : alt,
    );
    router.push("/login");
  };

  if (!account.data?.authenticated) {
    return (
      <Link
        href="/login"
        aria-label={t("accountMenu.signIn")}
        title={t("accountMenu.signIn")}
        className="group flex size-9 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border/70 transition-[color,box-shadow,transform] ring-inset hover:text-primary hover:ring-primary/45 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none active:scale-95"
      >
        <LockIcon className="size-4 group-hover:hidden group-focus-visible:hidden" />
        <LockOpenIcon className="hidden size-4 group-hover:block group-focus-visible:block" />
      </Link>
    );
  }

  const name = account.data.username ?? t("accountMenu.accountFallback");
  const initials = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("accountMenu.menuLabel")}
        className="group flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-border/70 transition-[box-shadow,transform] ring-inset hover:ring-primary/45 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none active:scale-95 data-[popup-open]:ring-primary/50"
      >
        {account.data.has_avatar ? (
          <Image
            key={account.dataUpdatedAt}
            src={`/api/account/avatar?v=${account.dataUpdatedAt}`}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-primary/10 text-[13px] font-semibold text-primary">
            {initials}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
            {account.data.has_avatar ? (
              <Image
                src={`/api/account/avatar?v=${account.dataUpdatedAt}`}
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
              {t("accountMenu.signedIn")}
            </span>
          </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/settings" />}>
          <SettingsIcon />
          {t("accountMenu.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings?section=keys" />}>
          <KeyRoundIcon />
          {t("accountMenu.apiKeys")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/docs" />}>
          <BookOpenIcon />
          {t("accountMenu.documentation")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <LogOutIcon />
          {t("accountMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
