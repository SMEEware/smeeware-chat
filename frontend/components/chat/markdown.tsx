"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/code-block";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { ChatImage } from "@/components/chat/chat-image";
import { ChatVideo, VideoCard } from "@/components/chat/chat-video";
import { videoSource } from "@/lib/video-source";
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

function imageKind(
  node: React.ReactNode,
): { src: string; alt: string } | null {
  const nodes = React.Children.toArray(node).filter(
    (child) => typeof child !== "string" || child.trim() !== "",
  );
  if (nodes.length !== 1) return null;

  const child = nodes[0];
  if (!React.isValidElement<{ src?: unknown; alt?: unknown }>(child)) return null;
  if (child.type !== "img") return null;

  const src = child.props.src;
  if (typeof src !== "string" || !src) return null;
  return { src, alt: typeof child.props.alt === "string" ? child.props.alt : "" };
}

const components: Components = {
  img({ src, alt }) {
    const source = typeof src === "string" ? videoSource(src) : null;
    if (source) return <ChatVideo source={source} title={alt || undefined} />;

    return <ChatImage src={typeof src === "string" ? src : undefined} alt={alt} />;
  },

  a({ href, children, ...props }) {
    const source = videoSource(href);

    if (source) {
      const image = imageKind(children);
      if (image) {
        return (
          <ChatVideo
            source={source}
            poster={image.src}
            title={image.alt || undefined}
          />
        );
      }

      if (toText(children).trim() === href) {
        return <ChatVideo source={source} />;
      }
    }

    if (!source && href) {
      const image = imageKind(children);
      if (image) {
        return (
          <VideoCard
            href={href}
            poster={image.src}
            title={image.alt || undefined}
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
        className={cn(
          "font-medium underline decoration-primary/35 underline-offset-3 transition-colors hover:decoration-primary",
          props.className,
        )}
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
        "[&_h1]:mt-6 [&_h1]:mb-2.5 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-primary",
        "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-border/50 [&_h2]:pb-1.5 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-primary",
        "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-[13px] [&_h4]:font-medium [&_h4]:text-muted-foreground",
        "[&_p]:my-2",
        "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:ps-5",
        "[&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:ps-5",
        "[&_li]:my-1 [&_li]:ps-0.5",
        "[&_ul>li]:marker:text-primary/60",
        "[&_ol>li]:marker:font-medium [&_ol>li]:marker:tabular-nums [&_ol>li]:marker:text-muted-foreground",
        "[&_li_ul]:my-1 [&_li_ol]:my-1",
        "[&_li:has(>input[type=checkbox])]:list-none [&_li:has(>input[type=checkbox])]:-ms-4",
        "[&_input[type=checkbox]]:me-1.5 [&_input[type=checkbox]]:align-[-0.08em] [&_input[type=checkbox]]:accent-primary",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_hr]:my-5 [&_hr]:border-border/60",
        "[&_blockquote]:my-3 [&_blockquote]:border-s-2 [&_blockquote]:border-primary/30 [&_blockquote]:ps-3.5 [&_blockquote]:text-muted-foreground",
        "[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-foreground/10 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]",
        "[&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:text-xs",
        "[&_thead]:bg-muted/60",
        "[&_th]:border-b [&_th]:border-border [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-start [&_th]:font-semibold [&_th]:whitespace-nowrap",
        "[&_td]:border-b [&_td]:border-border/50 [&_td]:px-2.5 [&_td]:py-1.5",
        "[&_tbody_tr:last-child_td]:border-b-0",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {clean}
      </ReactMarkdown>
    </div>
  );
});
