"use client";

import * as React from "react";
import { useT } from "@/context/i18n-provider";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Globe2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { ChatMessage } from "@/components/chat/chat-message";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePublicChat } from "@/hooks/use-chats";

export function PublicChatView({ id }: { id: string }) {
  const t = useT();
  const { data, isPending, isError } = usePublicChat(id);
  const router = useRouter();
  const path = usePathname();

  React.useEffect(() => {
    if (!isError) return;
    router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [isError, router, path]);

  if (isPending || isError || !data) return <ReadSkeleton />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 md:px-6">
          <Link
            href="/"
            aria-label={t("header.brand")}
            className="group flex size-11 shrink-0 items-center justify-center"
          >
            <Image
              src="/assets/img/icon.svg"
              height={44}
              width={44}
              alt=""
              className="h-auto w-full transition-transform duration-300 group-hover:scale-110"
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
              <Globe2Icon className="size-3" />
              {t("publicChat.shared")}
            </div>
            <h1 className="truncate font-heading text-lg leading-tight md:text-xl">
              {data.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground/70">
              <span>
                {data.message_count}{" "}
                {data.message_count === 1 ? t("publicChat.messageOne") : t("publicChat.messageMany")}
              </span>
              {data.model ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{data.model}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <time dateTime={data.updated_at}>{asDate(data.updated_at)}</time>
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-8 md:px-6">
              {data.messages.map((message) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <ChatMessage message={message} chatId={id} readOnly />
                </MessageScrollerItem>
              ))}

              <div className="mt-4 flex flex-col items-center gap-3 border-t border-border/60 pt-8 pb-4 text-center">
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t("publicChat.readOnly")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/login?next=%2Fchat">{t("publicChat.signIn")}</Link>}
                />
              </div>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  );
}

function ReadSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
      <Skeleton className="h-6 w-64" />
      {[0, 1, 2].map((line) => (
        <div key={line} className="flex flex-col gap-2">
          <Skeleton className="ml-auto h-9 w-52 rounded-3xl" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-8/12" />
        </div>
      ))}
    </div>
  );
}

function asDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
