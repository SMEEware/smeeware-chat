/**
 * Ausweichvorschlaege fuer die Startseite. Kommen zum Einsatz, solange
 * das Modell noch antwortet oder wenn das Backend nicht erreichbar ist --
 * so stehen immer drei Knoepfe da, statt einer Luecke.
 *
 * Bewusst rollenneutral: hier ist nicht bekannt, welche Persona gerade
 * eingestellt ist, also nichts IT-Spezifisches. Diese drei passen zu jedem
 * System-Prompt -- vom Reverse-Engineering-Mentor bis zum Einhorn.
 */
export const FALLBACK_SUGGESTIONS = [
  "What can you do?",
  "Surprise me",
  "Give me an idea",
] as const;
