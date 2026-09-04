/**
 * Die Verkabelung des Kommandosystems -- die Ebene unter dem Katalog.
 *
 * Hier stehen nur Namen und Draehte: die Ereignisnamen (``BEFEHL``) und die
 * vier Kanaele, ueber die eine Oberflaeche etwas ausloest, ohne die Stelle
 * zu kennen, die es tut. Was ein Kommando IST -- Beschriftung, Symbol,
 * Gruppe, Nutzen --, steht im Katalog (``command-registry``), der auf diese
 * Namen zeigt.
 *
 * Warum Fensterereignisse statt Kontext: der Knopf, der etwas ausloest, und
 * die Stelle, die es tut, liegen in verschiedenen Zweigen des Baums. Die
 * Palette weiss so nichts vom Composer und umgekehrt -- beide reichen nur
 * ein Ereignis weiter.
 *
 * Vier Kanaele:
 *   - ``dispatchCommand``  -- ein Signal ohne Nutzlast (neuer Chat, anhaengen)
 *   - ``dispatchNavigate`` -- "geh dorthin", die Palette hat den Router
 *   - ``dispatchInsert``   -- "leg diesen Text ins Feld", der Composer hoert
 *   - direkter Zustand     -- Schalter drehen ueber den Zustand, kein Draht
 */

export const BEFEHL = {
  // Command palette
  palette: "smeeware:chat-command",

  // Go to ...
  docs: "smeeware:go-to-docs",
  docsEndpoints: "smeeware:go-to-endpoits",
  account: "smeeware:go-to-account",
  settings: "smeeware:go-to-settings",
  apiKeys: "smeeware:go-to-apikeys",

  // Profile Settings
  changeUsername: "smeeware:user-settings-change-username",
  changeUserProfile: "smeeware:user-settings-change-profile-picture",
  changeUserPassword: "smeeware:user-settings-change-password",
  deleteAccount: "smeeware:user-settings-delete-account",

  // Api keys
  listApiKeys: "smeeware-list-api-keys",
  createApiKey: "smeeware:create-api-key",
  renameApiKey: "smeeware:rename-api-key",
  revokeApiKey: "smeeware:revoke-api-key",
  deleteApiKey: "smeeware:delete-api-key",
  apiKeyHealthCheck: "smeeware:health-check-api-key",

  // Chat-Settings
  newChat: "smeeware:new-chat",
  openChat: "smeeware:open-chat",
  renameChat: "smeeware:rename-chat",
  listChats: "smeeware:list-chats",
  archiveChat: "smeeware:archive-chat",
  deleteChat: "smeeware:chats-delete-chat",
  deleteAllChats: "smeeware:chats-delete-all",
  summarizeChat: "smeeware:summarize-chat",

  // Chat utils
  recordVoice: "smeeware:start-recording",
  attachments: "smeeware:attach-files", // Bilder und Textdateien
  comment: "smeeware:comment-message",
  shareChatHistory: "smeeware:share-chat-history",
  shareLiveChat: "smeeware-share-live-chat",

  // Workspaces -- Kontext, auf dem gearbeitet wird (Projektpfad o.ae.)
  manageWorkspaces: "smeeware:manage-workspaces",
  selectFolder: "smeeware:open-folder",

  // Chat Tweaks
  thinkingVisibility: "smeeware:thinking-toggle",
  enableToolsToggle: "smeeware:enable-tools",
  enableNotifictions: "smeeware:enable-notifications",

  // Models
  changeChatCompletionModel: "smeeware:change-completion-model",
  changeTranscriptionModel: "smeeware:change-transcription-model",
  changeTextToSpeechModel: "smeeware:change-tts-model",
  listaAllAvailableModels: "smeeware:list-models",

  // Providers Api Keys
  setDeepSeekApiKey: "smeeware:set-api-key-deepseek",
  setOpenAIApiKey: "smeeware:set-api-key-openai",
  setElevenlabsApiKey: "smeeware:set-api-key-elevenlabs",

  // System Prompts
  listSystemPrompts: "smeeware:list-system-prompts",
  newSystemPrompt: "smeeware:create-system-prompt",
  useSystemPrompt: "smeeware:use-system-prompt",

  // UI
  themeToggle: "smeeware:change-theme",
  startTour: "smeeware:start-tour",
  openSettingsDialog: "smeeware:open-settings-dialog",

  // ------------------ Prompt Actions ------------------------ //
  createImage: "smeeware:create-image",
  referenceMessage: "smeeware:reference-message",
  referenceContent: "smeeware:reference-message-content",
  referenceChats: "smeeware:reference-chat-history",
} as const;

export type BefehlName = (typeof BEFEHL)[keyof typeof BEFEHL];

/** Namen der Nutzlast-Kanaele -- eigene Ereignisse, damit sie nicht mit den
 *  signalfreien ``BEFEHL`` kollidieren. */
const NAV_EVENT = "smeeware:navigate";
const INSERT_EVENT = "smeeware:insert-text";
const QUOTE_EVENT = "smeeware:quote";

/**
 * Ein Zitat auf dem Weg zum Composer.
 *
 * Eigener Kanal statt ``dispatchInsert``: ein Zitat ist kein Text im Feld,
 * sondern ein eigener Zustand daneben -- er laesst sich wieder verwerfen,
 * ohne dass jemand ``> ``-Zeilen aus seinem Entwurf loeschen muss, und er
 * traegt mit, von wem zitiert wird.
 */
export type Zitat = {
  text: string;
  role: "user" | "assistant";
  messageId: string;
};

/** Ein signalfreies Kommando feuern. */
export function dispatchCommand(name: BefehlName) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

/** "Geh dorthin." Die Palette (die den Router hat) faengt es auf. */
export function dispatchNavigate(href: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { href } }));
  }
}

/** "Leg diesen Text ins Eingabefeld." Der Composer faengt es auf. */
export function dispatchInsert(text: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INSERT_EVENT, { detail: { text } }));
  }
}

/** "Zitiere das hier." Der Composer haengt es ueber sein Feld. */
export function dispatchQuote(zitat: Zitat) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: zitat }));
  }
}

/** ----------------------------- **/

/** Die Schnellwahl oeffnen. */
export function openChatCommand() {
  dispatchCommand(BEFEHL.palette);
}

/** Den Dateidialog des Composers oeffnen. */
export function openFilePicker() {
  dispatchCommand(BEFEHL.attachments);
}

/** Die Aufnahme im Composer starten. */
export function startRecording() {
  dispatchCommand(BEFEHL.recordVoice);
}

/** Eine Notiz an der letzten Nachricht ausloesen. */
export function startComment() {
  dispatchCommand(BEFEHL.comment);
}

/** Einen neuen Chat starten. */
export function startNewChat() {
  dispatchCommand(BEFEHL.newChat);
}

/** Die Doku oeffnen. */
export function openDocs() {
  dispatchCommand(BEFEHL.docs);
}

/** ----------------------------- **/

/** Abonnieren. Gibt die Abmeldung zurueck -- direkt fuer useEffect. */
export function onBefehl(name: BefehlName, handler: () => void) {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}

/** Auf "geh dorthin" hoeren. */
export function onNavigate(handler: (href: string) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<{ href: string }>).detail.href);
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}

/** Auf "leg diesen Text ins Feld" hoeren. */
export function onInsert(handler: (text: string) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<{ text: string }>).detail.text);
  window.addEventListener(INSERT_EVENT, listener);
  return () => window.removeEventListener(INSERT_EVENT, listener);
}

/** Auf "zitiere das hier" hoeren. */
export function onQuote(handler: (zitat: Zitat) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<Zitat>).detail);
  window.addEventListener(QUOTE_EVENT, listener);
  return () => window.removeEventListener(QUOTE_EVENT, listener);
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
