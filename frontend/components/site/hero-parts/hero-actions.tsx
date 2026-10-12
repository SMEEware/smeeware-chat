"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon } from "lucide-react";

import { useT } from "@/context/i18n-provider";

function shine(event: React.PointerEvent<HTMLAnchorElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--gx", `${((event.clientX - box.left) / box.width) * 100}%`);
  event.currentTarget.style.setProperty("--gy", `${((event.clientY - box.top) / box.height) * 100}%`);
}

export function HeroActions() {
  const t = useT();

  return (
    <div className="flex w-full items-center gap-3 sm:w-auto">
      <Link
        href="/chat"
        onPointerMove={shine}
        className="glass glass-ember group/cta flex h-12 min-w-0 flex-1 items-center justify-center gap-2.5 px-6 text-[15px] font-semibold text-white outline-none sm:flex-none"
      >
        <span className="relative truncate tracking-tight">{t("hero.startChatting")}</span>
        <ArrowRightIcon className="relative size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cta:translate-x-1" />
      </Link>

      <Link
        href="/docs/getting-started"
        onPointerMove={shine}
        className="glass glass-clear flex h-12 shrink-0 items-center gap-2 px-5 text-[15px] font-medium text-foreground outline-none"
      >
        <BookOpenIcon className="relative size-4 text-(--git-hot)" />
        <span className="relative tracking-tight whitespace-nowrap">{t("hero.readDocs")}</span>
      </Link>
    </div>
  );
}
