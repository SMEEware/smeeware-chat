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

/**
 * Das Drumherum des Chats -- und die Entscheidung, ob es ueberhaupt eines gibt.
 *
 * Unter ``/chat/<id>`` koennen zwei sehr verschiedene Leute landen: die
 * angemeldete Person mit ihren Verlaeufen, und jemand ohne Konto, der einen
 * geteilten Chat liest. Fuer die zweite waere die volle Huelle falsch --
 * Seitenleiste, Palette und Einfuehrung setzen alle eine Anmeldung voraus und
 * wuerden mit leeren Listen und fehlschlagenden Abfragen dastehen.
 *
 * Deshalb liegt die Entscheidung hier und nicht in der Seite: Layout ist eine
 * Frage der Huelle, nicht des Inhalts.
 */
export function ChatShell({ children }: { children: React.ReactNode }) {
  const konto = useAccount();

  // Solange offen ist, wer da ist, die schmale Fassung zeigen. Sie erst
  // aufzubauen und dann die Seitenleiste einzublenden waere ein sichtbarer
  // Sprung; andersherum blitzte die Leiste bei jedem oeffentlichen Aufruf auf.
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
      {/* Haengt am Layout, nicht an der Seite: ein Hinweis soll einen
          Wechsel von einem Chat zum naechsten ueberleben. */}
      <ServerToasts />
      {/* Wie die Hinweise am Layout: ein verkleinertes Video soll den
          Wechsel zwischen Chats ueberleben. */}
      <VideoFenster />
      {/* Die Sprechanzeige -- ein laufendes Vorlesen soll den Wechsel
          zwischen Chats genauso ueberleben. */}
      <SpeechFenster />
      {/* Spielt den Anmelde-Klang, wenn man gerade frisch hierher
          weitergeleitet wurde. */}
      <LoginChime />
      {/* Die Einfuehrung liegt ueber allem und laeuft genau einmal --
          sie zeigt auf Elemente in der Sidebar wie im Chat und gehoert
          deshalb dorthin, wo beide zusammenkommen. */}
      <ChatTour />
      {/* Kurze Rueckmeldungen fuer client-seitige Kommandos (kopiert,
          Modell gewechselt, umbenannt). Die Hinweise aus dem Backend laufen
          weiter ueber ServerToasts -- das hier ist nur fuer das, was im
          Browser selbst passiert. */}
      <Toaster position="bottom-center" />
    </SidebarProvider>
  );
}
