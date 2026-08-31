"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  /** Sprache aus dem Zaun bzw. der Doku-Definition. */
  language?: string;
  /** Ueberschreibt die Sprache in der Kopfzeile, etwa "stream.ts". */
  filename?: string;
  className?: string;
};

export function CodeBlock({
  code,
  language,
  filename,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const [html, setHtml] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    highlight(code, language)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      // Faerben ist Zierde. Schlaegt es fehl, bleibt der Klartext stehen.
      .catch(() => {});

    // Waehrend des Streamens loesen die Tokens diesen Effekt schnell
    // hintereinander aus; die alten Durchlaeufe duerfen das Ergebnis des
    // neuesten nicht ueberschreiben.
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Ohne sicheren Kontext gibt es kein Clipboard -- dann bleibt der
      // Text markierbar und der Knopf still.
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <figure
      className={cn(
        "group/code my-3 overflow-hidden rounded-2xl border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 py-1.5 pr-1.5 pl-4">
        <span className="font-mono text-xs text-muted-foreground">
          {filename ?? language ?? "Code"}
        </span>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="ml-auto size-7 text-muted-foreground"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>

      {html ? (
        // Shiki maskiert den Code beim Erzeugen -- siehe lib/highlight.ts.
        <div
          className="code-block-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        // Gleiche Masse wie die gefaerbte Fassung, damit beim Wechsel
        // nichts springt.
        <div className="code-block-body overflow-x-auto">
          <pre className="p-4 font-mono text-[13px] leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </figure>
  );
}
