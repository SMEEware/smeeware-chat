import type { Metadata } from "next";

import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = {
  title: "Chat — SMEEware Chat",
  description: "A saved conversation from the local SMEEware backend.",
};

export default async function StoredChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex h-full w-full flex-col">
      <ChatView id={id} />
    </div>
  );
}
