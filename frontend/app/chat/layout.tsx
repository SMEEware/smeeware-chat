import { ChatCommand } from "@/components/chat/chat-command";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatTour } from "@/components/chat/chat-tour";
import { LoginChime } from "@/components/chat/login-chime";
import { ServerToasts } from "@/components/chat/server-toasts";
import { SpeechFenster } from "@/components/chat/speech-fenster";
import { VideoFenster } from "@/components/chat/video-fenster";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

/**
 * Der Chat ist eine App-Ansicht, keine Dokumentseite: er fuellt genau
 * das Fenster und scrollt intern. Landing und Docs scrollen dagegen
 * ganz normal, darum sitzt diese Einschraenkung hier statt im Root.
 *
 * Die Sidebar haengt am Layout, nicht an der Seite -- so bleibt sie beim
 * Wechsel von einem Chat zum naechsten stehen und laedt ihre Liste nicht
 * jedes Mal neu.
 */
export default function ChatLayout({ children }: LayoutProps<"/chat">) {
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
