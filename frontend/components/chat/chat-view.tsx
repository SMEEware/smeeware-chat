"use client";

import Link from "next/link";
import { useT } from "@/context/i18n-provider";

import { ChatPanel } from "@/components/chat/chat-panel";
import { PublicChatView } from "@/components/chat/public-chat-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/hooks/use-account";
import { useChatDetail } from "@/hooks/use-chats";
import { ChatNotFound } from "@/lib/chat/history";

export function ChatView({ id }: { id: string }) {
  const account = useAccount();

  if (account.isPending) return <HistorySkeleton />;

  if (!account.data?.authenticated) return <PublicChatView id={id} />;

  return <OwnChat id={id} />;
}

function OwnChat({ id }: { id: string }) {
  const t = useT();
  const { data, isPending, isError, error } = useChatDetail(id);

  if (isError && error instanceof ChatNotFound) {
    return <ChatPanel key={id} chatId={id} />;
  }

  if (isPending) return <HistorySkeleton />;

  if (isError || !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-heading text-lg">{t("chatView.gone")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error?.message ?? t("chatView.notLoaded")}
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/chat">{t("chatView.startNew")}</Link>}
        />
      </div>
    );
  }

  return <ChatPanel key={id} chatId={id} initialMessages={data.messages} />;
}

function HistorySkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
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
