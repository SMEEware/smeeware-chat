import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

/**
 * /chat ist keine eigene Ansicht mehr, sondern der Einstieg in einen neuen
 * Chat: eine frische id ziehen und dorthin umleiten.
 *
 * Damit hat jeder Chat von der ersten Sekunde an eine Adresse. Vorher lebte
 * ein neuer Chat unter /chat und bekam seine id erst beim Senden per
 * history.replaceState nachgereicht -- die Adressleiste stimmte danach,
 * der Routerzustand von Next aber nicht. Ein Sprung auf /chat war dann ein
 * Wechsel auf dieselbe Route und tat schlicht nichts.
 *
 * force-dynamic ist Pflicht: ohne das rendert Next diese Seite einmal beim
 * Bauen vor und liefert fuer immer dieselbe id aus.
 */
export const dynamic = "force-dynamic";

export default function NewChatPage() {
  redirect(`/chat/${randomUUID()}`);
}
