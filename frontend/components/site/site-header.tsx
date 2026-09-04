import Image from "next/image";
import Link from "next/link";

import { AccountMenu } from "@/components/site/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/docs", label: "Documentation" },
  { href: "/docs/endpoints", label: "Endpoints" },
  { href: "/docs/changelog", label: "Changelog" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky w-full md:w-4xl place-self-center rounded-none md:rounded-full top-0 md:top-6 z-40 border-b bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/assets/img/icon.svg"
            alt="Smeeware"
            width={28}
            height={28}
            className="size-7"
          />
          <span className="font-heading font-semibold tracking-tight">
            SMEEware Chat
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
