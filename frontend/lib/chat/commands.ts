export const COMMAND_EVENT = {
  palette: "smeeware:chat-command",

  docs: "smeeware:go-to-docs",
  docsEndpoints: "smeeware:go-to-endpoits",
  account: "smeeware:go-to-account",
  settings: "smeeware:go-to-settings",
  apiKeys: "smeeware:go-to-apikeys",

  changeUsername: "smeeware:user-settings-change-username",
  changeUserProfile: "smeeware:user-settings-change-profile-picture",
  changeUserPassword: "smeeware:user-settings-change-password",
  deleteAccount: "smeeware:user-settings-delete-account",

  listApiKeys: "smeeware-list-api-keys",
  createApiKey: "smeeware:create-api-key",
  renameApiKey: "smeeware:rename-api-key",
  revokeApiKey: "smeeware:revoke-api-key",
  deleteApiKey: "smeeware:delete-api-key",
  apiKeyHealthCheck: "smeeware:health-check-api-key",

  newChat: "smeeware:new-chat",
  openChat: "smeeware:open-chat",
  renameChat: "smeeware:rename-chat",
  listChats: "smeeware:list-chats",
  archiveChat: "smeeware:archive-chat",
  deleteChat: "smeeware:chats-delete-chat",
  deleteAllChats: "smeeware:chats-delete-all",
  summarizeChat: "smeeware:summarize-chat",

  recordVoice: "smeeware:start-recording",
  voiceCall: "smeeware:voice-call",
  attachments: "smeeware:attach-files",
  comment: "smeeware:comment-message",
  shareChatHistory: "smeeware:share-chat-history",
  shareLiveChat: "smeeware-share-live-chat",

  manageWorkspaces: "smeeware:manage-workspaces",
  managePlugins: "smeeware:manage-plugins",
  selectFolder: "smeeware:open-folder",

  thinkingVisibility: "smeeware:thinking-toggle",
  enableToolsToggle: "smeeware:enable-tools",
  enableNotifications: "smeeware:enable-notifications",

  changeChatCompletionModel: "smeeware:change-completion-model",
  changeTranscriptionModel: "smeeware:change-transcription-model",
  changeTextToSpeechModel: "smeeware:change-tts-model",
  listAllAvailableModels: "smeeware:list-models",

  setDeepSeekApiKey: "smeeware:set-api-key-deepseek",
  setOpenAIApiKey: "smeeware:set-api-key-openai",
  setElevenlabsApiKey: "smeeware:set-api-key-elevenlabs",

  listSystemPrompts: "smeeware:list-system-prompts",
  newSystemPrompt: "smeeware:create-system-prompt",
  useSystemPrompt: "smeeware:use-system-prompt",

  themeToggle: "smeeware:change-theme",
  startTour: "smeeware:start-tour",
  openSettingsDialog: "smeeware:open-settings-dialog",

  createImage: "smeeware:create-image",
  referenceMessage: "smeeware:reference-message",
  referenceContent: "smeeware:reference-message-content",
  referenceChats: "smeeware:reference-chat-history",
} as const;

export type CommandEventName = (typeof COMMAND_EVENT)[keyof typeof COMMAND_EVENT];

const NAV_EVENT = "smeeware:navigate";
const INSERT_EVENT = "smeeware:insert-text";
const QUOTE_EVENT = "smeeware:quote";

export type Quote = {
  text: string;
  role: "user" | "assistant";
  messageId: string;
};

export function dispatchCommand(name: CommandEventName) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

export function dispatchNavigate(href: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { href } }));
  }
}

export function dispatchInsert(text: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INSERT_EVENT, { detail: { text } }));
  }
}

export function dispatchQuote(quote: Quote) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: quote }));
  }
}

export function openChatCommand() {
  dispatchCommand(COMMAND_EVENT.palette);
}

export function openFilePicker() {
  dispatchCommand(COMMAND_EVENT.attachments);
}

export function startRecording() {
  dispatchCommand(COMMAND_EVENT.recordVoice);
}

export function startComment() {
  dispatchCommand(COMMAND_EVENT.comment);
}

export function startNewChat() {
  dispatchCommand(COMMAND_EVENT.newChat);
}

export function openDocs() {
  dispatchCommand(COMMAND_EVENT.docs);
}

export function onCommand(name: CommandEventName, handler: () => void) {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}

export function onNavigate(handler: (href: string) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<{ href: string }>).detail.href);
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}

export function onInsert(handler: (text: string) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<{ text: string }>).detail.text);
  window.addEventListener(INSERT_EVENT, listener);
  return () => window.removeEventListener(INSERT_EVENT, listener);
}

export function onQuote(handler: (quote: Quote) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<Quote>).detail);
  window.addEventListener(QUOTE_EVENT, listener);
  return () => window.removeEventListener(QUOTE_EVENT, listener);
}

export function isShortcut(event: KeyboardEvent, key: string): boolean {
  return (
    event.key.toLowerCase() === key.toLowerCase() &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}
