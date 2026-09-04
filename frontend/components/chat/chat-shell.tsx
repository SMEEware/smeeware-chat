"use client";

import * as React from "react";

import { ChatCommand } from "@/components/chat/chat-command";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatTour } from "@/components/chat/chat-tour";
import { LoginChime } from "@/components/chat/login-chime";
import { ServerToasts } from "@/components/chat/server-toasts";
import { SpeechFenster } from "@/components/chat/speech-fenster";
import { VideoFenster } from "@/components/chat/video-fenster";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAccount } from "@/hooks/use-account";

export function ChatShell({ children }: { children: React.ReactNode }) {
  const konto = useAccount();

  const angemeldet = konto.data?.authenticated === true;

  if (!angemeldet) {
    return (
      <div className="flex h-[100svh] min-h-0 flex-col overflow-hidden">
        {children}
        <Toaster position="bottom-center" />
      </div>
    );
  }

  return (
    <SidebarProvider className="h-[100svh] min-h-0 overflow-hidden select-none">
      <ChatSidebar />
      <ChatCommand />
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </SidebarInset>
      <ServerToasts />
      <VideoFenster />
      <SpeechFenster />
      <LoginChime />
      <ChatTour />
      <Toaster position="bottom-center" />
    </SidebarProvider>
  );
}
