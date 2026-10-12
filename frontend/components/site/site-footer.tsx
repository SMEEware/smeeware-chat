"use client";

import Link from "next/link";

import { useT } from "@/context/i18n-provider";

export function SiteFooter({ withLinks = false }: { withLinks?: boolean }) {
  const t = useT();

  const columns = [
    {
      title: t("footer.product"),
      links: [
        { href: "/chat", label: t("nav.chat") },
        { href: "/docs", label: t("nav.documentation") },
        { href: "/docs/changelog", label: t("nav.changelog") },
      ],
    },
    {
      title: t("footer.develop"),
      links: [
        { href: "/docs/getting-started", label: t("nav.quickstart") },
        { href: "/docs/authentication", label: t("nav.authentication") },
        { href: "/docs/endpoints", label: t("nav.endpoints") },
      ],
    },
    {
      title: t("footer.reference"),
      links: [
        { href: "/docs/streaming", label: t("nav.streaming") },
        { href: "/docs/errors", label: t("nav.errors") },
        { href: "/docs/rate-limits", label: t("nav.rateLimits") },
      ],
    },
  ];

  return (
    <footer className="border-t">
      {withLinks ? (
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div className="flex flex-col gap-2">
            <span className="font-heading font-semibold tracking-tight">
              {t("header.brand")}
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("footer.tagline")}
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <span className="text-sm font-medium">{column.title}</span>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <div className={withLinks ? "border-t" : undefined}>
        <div className="mx-auto flex w-full max-w-6xl justify-center px-6 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} SMEEware</span>
        </div>
      </div>
    </footer>
  );
}
