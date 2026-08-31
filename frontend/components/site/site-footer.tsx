import Link from "next/link";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/chat", label: "Chat" },
      { href: "/docs", label: "Documentation" },
      { href: "/docs/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Develop",
    links: [
      { href: "/docs/getting-started", label: "Quickstart" },
      { href: "/docs/authentication", label: "Authentication" },
      { href: "/docs/endpoints", label: "Endpoints" },
    ],
  },
  {
    title: "Reference",
    links: [
      { href: "/docs/streaming", label: "Streaming" },
      { href: "/docs/errors", label: "Errors" },
      { href: "/docs/rate-limits", label: "Rate Limits" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="flex flex-col gap-2">
          <span className="font-heading font-semibold tracking-tight">
            SMEEware Chat
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A local chat with tools, files and your own models. Nothing leaves
            this machine unless you send it somewhere.
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

      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Smeeware</span>
          <span className="sm:ml-auto">
            All placeholder — nothing final yet.
          </span>
        </div>
      </div>
    </footer>
  );
}
