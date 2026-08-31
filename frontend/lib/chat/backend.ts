/**
 * Der Stream-Endpunkt des Backends. An einer Stelle, damit Chat und
 * Vorschlaege dieselbe Quelle ansprechen und nicht auseinanderlaufen.
 */
export const CHAT_STREAM_ENDPOINT =
  process.env.LLM_STREAM_URL ?? "http://127.0.0.1:8000/api/v1/chat/stream";

/**
 * GET /models liegt neben /chat/stream unter demselben api_prefix. Wir
 * leiten den Pfad aus der Stream-URL ab, damit eine einzige Env-Variable
 * beide steuert -- optional per LLM_MODELS_URL ueberschreibbar.
 */
export const MODELS_ENDPOINT =
  process.env.LLM_MODELS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/models");

/**
 * Die Chat-Ablage liegt neben /chat/stream unter demselben api_prefix --
 * wieder aus der Stream-URL abgeleitet, damit eine Env-Variable genuegt.
 */
export const CHATS_ENDPOINT =
  process.env.LLM_CHATS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/chats");

/**
 * Anhaenge liegen wieder unter demselben api_prefix. Dieselbe Ableitung wie
 * oben, damit eine einzige Env-Variable alle vier Endpunkte umzieht.
 */
export const UPLOADS_ENDPOINT =
  process.env.LLM_UPLOADS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/uploads");

/** Spracheingabe -- dieselbe Ableitung wie die uebrigen Endpunkte. */
export const TRANSCRIBE_ENDPOINT =
  process.env.LLM_TRANSCRIBE_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/transcribe");

/** Das Konto -- dieselbe Ableitung wie die uebrigen Endpunkte. */
export const ACCOUNT_ENDPOINT =
  process.env.LLM_ACCOUNT_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/account");

/** Die System-Prompts -- dieselbe Ableitung wie die uebrigen Endpunkte. */
export const PROMPTS_ENDPOINT =
  process.env.LLM_PROMPTS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/prompts");

/** Der Ereignis-Strom -- dieselbe Ableitung wie die uebrigen Endpunkte. */
export const EVENTS_ENDPOINT =
  process.env.LLM_EVENTS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/events");

/** Gespeicherte Hinweise -- dieselbe Ableitung wie die uebrigen Endpunkte. */
export const NOTIFICATIONS_ENDPOINT =
  process.env.LLM_NOTIFICATIONS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/notifications");

/** Die API-Schluessel des Kontos -- dieselbe Ableitung wie die uebrigen. */
export const KEYS_ENDPOINT =
  process.env.LLM_KEYS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/account/keys");

/** Vorlesen -- dieselbe Ableitung wie die uebrigen Endpunkte. */
export const TTS_ENDPOINT =
  process.env.LLM_TTS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/tts");
