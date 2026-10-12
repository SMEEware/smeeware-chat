"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { MethodBadge } from "@/components/docs/docs-blocks";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { docsNavigation, hrefForSlug } from "@/lib/docs/navigation";
import { useLocale, useT } from "@/context/i18n-provider";
import { td } from "@/lib/docs/de";

export function DocsSearch() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((previous) => !previous);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-full border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-accent sm:w-64"
      >
        <SearchIcon className="size-4" />
        <span>{t("docs.searchButton")}</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("docs.searchDialogTitle")}
        description={t("docs.searchDialogDesc")}
      >
        <Command>
          <CommandInput placeholder={t("docs.searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("docs.nothingFound")}</CommandEmpty>

            {docsNavigation.map((group) => (
              <CommandGroup key={group.title} heading={td(locale, group.title)}>
                {group.pages.map((page) => {
                  const href = hrefForSlug(page.slug);
                  return (
                    <CommandItem
                      key={href}
                      value={`${td(locale, page.title)} ${td(locale, page.description)} ${page.title} ${page.description} ${page.slug}`}
                      onSelect={() => go(href)}
                    >
                      <span>{td(locale, page.title)}</span>
                      {page.method ? (
                        <MethodBadge method={page.method} className="ml-auto" />
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
