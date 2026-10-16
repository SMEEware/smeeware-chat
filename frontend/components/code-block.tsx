"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";

type CodeBlockProps = {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  variant?: "default" | "chat";
};

export function CodeBlock({
  code,
  language,
  filename,
  className,
  variant = "default",
}: CodeBlockProps) {
  const t = useT();
  const lineCount = code.split(/\r\n|\n|\r/).length;
  const longChatBlock = variant === "chat" && lineCount > 20;
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
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <figure
      className={cn(
        "group/code relative my-3 min-w-0 overflow-clip rounded-2xl border bg-card",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b bg-muted/40 py-1.5 ps-4 pe-1.5",
          longChatBlock && "sticky top-0 z-10 bg-card/95 backdrop-blur-sm",
        )}
      >
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {filename ?? language ?? "Code"}
        </span>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={copy}
          aria-label={copied ? t("codeBlock.copied") : t("codeBlock.copy")}
          title={copied ? t("codeBlock.copied") : t("codeBlock.copy")}
          className="ms-auto size-8 cursor-pointer text-muted-foreground"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>

      {html ? (
        <div
          className="code-block-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="code-block-body overflow-x-auto">
          <pre className="p-4 font-mono text-[13px] leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      )}

      {longChatBlock ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/25 py-1.5 ps-4 pe-2">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {lineCount} {t("codeBlock.lines")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={copy}
            aria-label={copied ? t("codeBlock.copied") : t("codeBlock.copy")}
            className="h-8 cursor-pointer gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            {copied ? t("codeBlock.copied") : t("codeBlock.copy")}
          </Button>
        </div>
      ) : null}
      <span role="status" className="sr-only">
        {copied ? t("codeBlock.copied") : ""}
      </span>
    </figure>
  );
}
