"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";

import { MethodBadge } from "@/components/docs/docs-blocks";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { docsNavigation, hrefForSlug } from "@/lib/docs/navigation";
import { cn } from "@/lib/utils";

export function DocsSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // Auf dem Handy liegt die Navigation in einem Sheet -- nach dem Tippen
  // muss es zugehen, sonst verdeckt es die Seite, zu der man wollte.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar
      collapsible="offcanvas"
      className="overflow-clip rounded-r-xl border border-sidebar-border/70"
    >
      <SidebarHeader className="relative h-14 justify-center border-b border-sidebar-border/70 px-3">
        {/* Derselbe Schein wie in den Modalen und in der Chat-Sidebar. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/25 opacity-40 blur-3xl"
        />
        <Link href="/" className="group relative flex w-fit items-center gap-2">
          <Image
            src="/assets/img/icon.svg"
            height={24}
            width={24}
            alt="SMEEware"
            className="size-6 shrink-0 transition-transform duration-300 group-hover:scale-110"
          />
          <span className="font-heading text-[13px] font-semibold tracking-tight">
            SMEEware
          </span>
          {/* Kein Farbklecks: das Kuerzel sagt, in welchem Teil man ist. */}
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-primary/80">
            docs
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-4">
        {docsNavigation.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.title}>
              {/* Klebt beim Scrollen oben fest -- bei langen Kapiteln weiss
                  man sonst nicht mehr, worin man gerade blaettert. */}
              <h3 className="sticky top-0 z-10 -mx-2 flex items-center gap-2 bg-sidebar/85 px-3 pt-4 pb-1.5 text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase backdrop-blur-sm">
                <Icon className="size-3 shrink-0 text-primary/50" />
                {group.title}
              </h3>

              {/* Die Haarlinie laeuft durch das ganze Kapitel; die einzelne
                  Seite setzt nur ihr Stueck davon in Farbe. */}
              <ul className="relative flex flex-col before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-sidebar-border/70">
                {group.pages.map((page) => {
                  const href = hrefForSlug(page.slug);
                  const aktiv = pathname === href;

                  return (
                    <li key={href} className="group/zeile relative">
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-1/2 left-0 -translate-y-1/2 rounded-full transition-all duration-200",
                          aktiv
                            ? "h-5 w-0.5 bg-primary"
                            : "h-3 w-0.5 bg-transparent group-hover/zeile:bg-foreground/25",
                        )}
                      />
                      <Link
                        href={href}
                        onClick={closeOnMobile}
                        aria-current={aktiv ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-r-md pr-2 pl-4 text-[13px] transition-colors",
                          // Rechts gerundet, links flach: die Zeile haengt
                          // an der Schiene, statt daneben zu liegen.
                          aktiv
                            ? "bg-primary/[0.07] font-medium text-foreground"
                            : "text-muted-foreground/90 hover:bg-primary/[0.035] hover:text-foreground",
                        )}
                      >
                        <span className="truncate">{page.title}</span>
                        {page.method ? (
                          <MethodBadge
                            method={page.method}
                            className={cn(
                              "ml-auto transition-opacity",
                              aktiv ? "opacity-100" : "opacity-60",
                            )}
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70 px-3 py-2.5">
        <Link
          href="/chat"
          className="group flex items-center gap-1.5 text-[11px] text-muted-foreground/50 transition-colors hover:text-primary"
        >
          Open Chat
          <ArrowRightIcon className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
