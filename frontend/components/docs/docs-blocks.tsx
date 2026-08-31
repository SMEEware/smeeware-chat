import Link from "next/link";
import { ArrowRightIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocBlock } from "@/lib/docs/content";
import type { HttpMethod } from "@/lib/docs/navigation";

/** Farbe je Verb -- GET liest, POST schreibt, DELETE zerstoert. */
const methodStyles: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  POST: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  PATCH: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  DELETE: "bg-destructive/10 text-destructive",
};

export function MethodBadge({
  method,
  className,
}: {
  method: HttpMethod;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-[10px] font-semibold tracking-wide",
        methodStyles[method],
        className,
      )}
    >
      {method}
    </span>
  );
}

function DocsBlock({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "lead":
      return (
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
          {block.text}
        </p>
      );

    case "heading":
      return (
        // scroll-mt haelt die Ueberschrift unter der klebenden Kopfzeile,
        // wenn ein Anker angesprungen wird.
        <h2
          id={block.id}
          className="group/heading scroll-mt-24 pt-6 text-xl font-semibold tracking-tight"
        >
          <a href={`#${block.id}`} className="inline-flex items-baseline gap-2">
            {block.title}
            <span
              aria-hidden
              className="text-muted-foreground opacity-0 transition-opacity group-hover/heading:opacity-100"
            >
              #
            </span>
          </a>
        </h2>
      );

    case "paragraph":
      return <p className="leading-relaxed text-foreground/80">{block.text}</p>;

    case "code":
      return (
        <CodeBlock
          code={block.code}
          language={block.language}
          filename={block.filename}
        />
      );

    case "tabs":
      return <CodeTabs tabs={block.tabs} />;

    case "callout": {
      const Icon = block.variant === "warning" ? TriangleAlertIcon : InfoIcon;
      return (
        <Alert variant={block.variant === "warning" ? "destructive" : "default"}>
          <Icon />
          <AlertTitle>{block.title}</AlertTitle>
          <AlertDescription>{block.text}</AlertDescription>
        </Alert>
      );
    }

    case "steps":
      return (
        <ol className="flex flex-col gap-5 border-l pl-6">
          {block.steps.map((step, index) => (
            <li key={step.title} className="relative">
              <span className="absolute -left-[34px] flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-4 ring-background">
                {index + 1}
              </span>
              <p className="font-medium">{step.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      );

    case "params":
      return (
        <div className="overflow-hidden rounded-2xl border">
          {block.rows.map((row, index) => (
            <div
              key={row.name}
              className={cn(
                "flex flex-col gap-1 p-4",
                index > 0 && "border-t",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm font-medium">{row.name}</code>
                <span className="font-mono text-xs text-muted-foreground">
                  {row.type}
                </span>
                {row.required ? (
                  <Badge variant="secondary" className="text-[10px]">
                    required
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {row.text}
              </p>
            </div>
          ))}
        </div>
      );

    case "responses":
      return (
        <div className="overflow-hidden rounded-2xl border">
          {block.rows.map((row, index) => (
            <div
              key={row.status}
              className={cn(
                "flex items-baseline gap-4 p-4",
                index > 0 && "border-t",
              )}
            >
              <code
                className={cn(
                  "font-mono text-sm font-semibold",
                  row.status.startsWith("2")
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                {row.status}
              </code>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {row.text}
              </p>
            </div>
          ))}
        </div>
      );

    case "cards":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group/card relative flex flex-col gap-1 overflow-hidden rounded-2xl p-4 ring-1 ring-border/70 transition-colors ring-inset hover:bg-primary/[0.04] hover:ring-primary/40"
            >
              {/* Derselbe Schimmer wie am "New chat"-Knopf und an den
                  Einstiegen im leeren Chat -- laeuft beim Hover einmal
                  durch, danach liegt die Flaeche wieder ruhig. */}
              <span
                aria-hidden
                className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-primary/12 to-transparent transition-transform duration-700 ease-out group-hover/card:translate-x-[200%]"
              />
              <span className="relative flex items-center gap-1.5 font-medium">
                {card.title}
                <ArrowRightIcon className="size-3.5 text-muted-foreground transition-[color,transform] duration-300 group-hover/card:translate-x-0.5 group-hover/card:text-primary" />
              </span>
              <span className="relative text-sm leading-relaxed text-muted-foreground">
                {card.text}
              </span>
            </Link>
          ))}
        </div>
      );

    case "endpoint":
      return (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/40 px-4 py-3">
          <MethodBadge method={block.method} />
          <code className="font-mono text-sm">{block.path}</code>
        </div>
      );
  }
}

export function DocsBlocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => (
        <DocsBlock key={index} block={block} />
      ))}
    </div>
  );
}
