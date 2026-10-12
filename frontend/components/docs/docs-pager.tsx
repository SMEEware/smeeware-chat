"use client";

import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { docNeighbours } from "@/lib/docs/navigation";
import { useLocale, useT } from "@/context/i18n-provider";
import { td } from "@/lib/docs/de";

export function DocsPager({ slug }: { slug: string }) {
  const t = useT();
  const locale = useLocale();
  const { previous, next } = docNeighbours(slug);
  if (!previous && !next) return null;

  return (
    <nav className="mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row">
      {previous ? (
        <Link
          href={previous.href}
          className="group/pager flex flex-1 flex-col gap-1 rounded-2xl border p-4 transition-colors hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeftIcon className="size-3 transition-transform group-hover/pager:-translate-x-0.5" />
            {t("docs.previous")}
          </span>
          <span className="font-medium">{td(locale, previous.title)}</span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group/pager flex flex-1 flex-col items-end gap-1 rounded-2xl border p-4 text-right transition-colors hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("docs.next")}
            <ArrowRightIcon className="size-3 transition-transform group-hover/pager:translate-x-0.5" />
          </span>
          <span className="font-medium">{td(locale, next.title)}</span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}
    </nav>
  );
}
