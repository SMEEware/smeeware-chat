/**
 * Die Kommandos der App -- an einer Stelle.
 *
 * Zwei Oberflaechen zeigen dieselbe Liste: die Fusszeile der Sidebar und die
 * Palette. Stuenden die Kuerzel zweimal im Code, liefen sie irgendwann
 * auseinander -- genau so stand vorher "New chat" mit dem Kuerzel der
 * Palette daneben.
 *
 * Ausgeloest wird ueber Fensterereignisse statt ueber Kontext: der Knopf,
 * der etwas ausloest, und die Stelle, die es tut, liegen in verschiedenen
 * Zweigen des Baums. Die Palette weiss so nichts vom Composer und umgekehrt.
 */

export const BEFEHL = {
  palette: "smeeware:chat-command",
  anhaenge: "smeeware:attach-files",
  aufnahme: "smeeware:start-recording",
} as const;

type BefehlName = (typeof BEFEHL)[keyof typeof BEFEHL];

function ausloesen(name: BefehlName) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

/** Die Schnellwahl oeffnen. */
export function openChatCommand() {
  ausloesen(BEFEHL.palette);
}

/** Den Dateidialog des Composers oeffnen. */
export function openFilePicker() {
  ausloesen(BEFEHL.anhaenge);
}

/** Die Aufnahme im Composer starten. */
export function startRecording() {
  ausloesen(BEFEHL.aufnahme);
}

/** Abonnieren. Gibt die Abmeldung zurueck -- direkt fuer useEffect. */
export function onBefehl(name: BefehlName, handler: () => void) {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}

/**
 * Prueft ein Tastenereignis gegen ein Kuerzel der Form Cmd/Strg + Taste.
 *
 * Alt und Shift schliessen wir aus: sonst schluckt Cmd+Alt+I (Konsole) das
 * Kuerzel fuer die Aufnahme.
 */
export function istKuerzel(event: KeyboardEvent, taste: string): boolean {
  return (
    event.key.toLowerCase() === taste.toLowerCase() &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export type Kuerzel = {
  id: string;
  label: string;
  /** Was auf den Tastenkappen steht. */
  tasten: string[];
};

/** Die Reihenfolge, in der beide Oberflaechen sie zeigen. */
export const KUERZEL: Kuerzel[] = [
  { id: "palette", label: "Command palette", tasten: ["⌘", "K"] },
  // Nicht N: Cmd+N reservieren die Browser fuer ein neues Fenster, und
  // preventDefault greift dort nicht. Cmd+J laesst sich abfangen.
  { id: "new", label: "New chat", tasten: ["⌘", "J"] },
  { id: "attach", label: "Attach files", tasten: ["⌘", "O"] },
  { id: "record", label: "Start recording", tasten: ["⌘", "I"] },
];
