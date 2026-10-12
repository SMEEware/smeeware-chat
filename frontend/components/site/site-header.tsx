"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { AccountMenu } from "@/components/site/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useT } from "@/context/i18n-provider";
import { cn } from "@/lib/utils";

export function SiteHeader({ autoHide = false }: { autoHide?: boolean }) {
  const t = useT();
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    if (!autoHide) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const hero = document.getElementById("hero");
      const limit = hero ? hero.offsetTop + hero.offsetHeight - 140 : 640;
      setHidden(window.scrollY > limit);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [autoHide]);
  const links = [
    { href: "/docs", label: t("nav.documentation") },
    { href: "/docs/endpoints", label: t("nav.endpoints") },
    { href: "/docs/changelog", label: t("nav.changelog") },
  ];

  return (
    <header
      data-hidden={hidden || undefined}
      className={cn(
        "sticky top-0 z-40 w-full place-self-center rounded-none border-b bg-background/70 backdrop-blur-md transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:top-6 md:w-[min(56rem,calc(100%-2rem))] md:rounded-full",
        hidden &&
          "pointer-events-none -translate-y-[calc(100%+2rem)] opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/assets/img/icon.svg"
            alt="Smeeware"
            width={28}
            height={28}
            className="size-7"
          />
          <span className="font-heading font-semibold tracking-tight whitespace-nowrap">
            {t("header.brand")}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
