import { ChatShell } from "@/components/chat/chat-shell";

/**
 * Der Chat ist eine App-Ansicht, keine Dokumentseite: er fuellt genau
 * das Fenster und scrollt intern. Landing und Docs scrollen dagegen
 * ganz normal, darum sitzt diese Einschraenkung hier statt im Root.
 *
 * Die Huelle selbst -- Seitenleiste, Palette, Einfuehrung -- steht in
 * ``ChatShell``. Sie muss wissen, wer da ist: unter derselben Adresse liest
 * unter Umstaenden jemand ohne Konto einen geteilten Verlauf, und fuer den
 * gibt es keine Seitenleiste. Diese Entscheidung braucht den Browser,
 * deshalb liegt sie in einer Client-Komponente und nicht hier.
 */
export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return <ChatShell>{children}</ChatShell>;
}
