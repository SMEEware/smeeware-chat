"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/code-block";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { ChatImage } from "@/components/chat/chat-image";
import { ChatVideo, VideoKarte } from "@/components/chat/chat-video";
import { videoQuelle } from "@/lib/video-source";
import { cn } from "@/lib/utils";

const languageOf = (className?: string) =>
  /language-([\w-]+)/.exec(className ?? "")?.[1];

function toText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(toText).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return toText(node.props.children);
  }
  return "";
}

function bildKind(
  node: React.ReactNode,
): { src: string; alt: string } | null {
  const kinder = React.Children.toArray(node).filter(
    (kind) => typeof kind !== "string" || kind.trim() !== "",
  );
  if (kinder.length !== 1) return null;

  const kind = kinder[0];
  if (!React.isValidElement<{ src?: unknown; alt?: unknown }>(kind)) return null;
  if (kind.type !== "img") return null;

  const src = kind.props.src;
  if (typeof src !== "string" || !src) return null;
  return { src, alt: typeof kind.props.alt === "string" ? kind.props.alt : "" };
}

const components: Components = {
  img({ src, alt }) {
    const quelle = typeof src === "string" ? videoQuelle(src) : null;
    if (quelle) return <ChatVideo quelle={quelle} titel={alt || undefined} />;

    return <ChatImage src={typeof src === "string" ? src : undefined} alt={alt} />;
  },

  a({ href, children, ...props }) {
    const quelle = videoQuelle(href);

    if (quelle) {
      const bild = bildKind(children);
      if (bild) {
        return (
          <ChatVideo
            quelle={quelle}
            poster={bild.src}
            titel={bild.alt || undefined}
          />
        );
      }

      if (toText(children).trim() === href) {
        return <ChatVideo quelle={quelle} />;
      }
    }

    if (!quelle && href) {
      const bild = bildKind(children);
      if (bild) {
        return (
          <VideoKarte
            href={href}
            poster={bild.src}
            titel={bild.alt || undefined}
          />
        );
      }
    }

    const inPage = href?.startsWith("#") ?? false;

    return (
      <a
        href={href}
        target={inPage ? undefined : "_blank"}
        rel={inPage ? undefined : "noopener noreferrer"}
        {...props}
      >
        {children}
      </a>
    );
  },

  pre({ children }) {
    const code = React.Children.toArray(children).find((child) =>
      React.isValidElement<{ className?: string; children?: React.ReactNode }>(
        child,
      ),
    ) as
      | React.ReactElement<{ className?: string; children?: React.ReactNode }>
      | undefined;

    if (!code) {
      return <CodeBlock code={toText(children)} />;
    }

    return (
      <CodeBlock
        code={toText(code.props.children).replace(/\n$/, "")}
        language={languageOf(code.props.className)}
      />
    );
  },
};

export const Markdown = React.memo(function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const clean = stripToolScaffolding(children);

  return (
    <div
      className={cn(
        "min-w-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold",
        "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold",
        "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_p]:my-2",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5",
        "[&_li]:my-0.5 [&_li]:marker:text-muted-foreground",
        "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-3",
        "[&_strong]:font-semibold",
        "[&_hr]:my-4 [&_hr]:border-border",
        "[&_blockquote]:my-2 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground",
        "[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-foreground/10 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]",
        "[&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {clean}
      </ReactMarkdown>
    </div>
  );
});
