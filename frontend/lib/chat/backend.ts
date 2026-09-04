export const CHAT_STREAM_ENDPOINT =
  process.env.LLM_STREAM_URL ?? "http://127.0.0.1:8000/api/v1/chat/stream";

export const MODELS_ENDPOINT =
  process.env.LLM_MODELS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/models");

export const CHATS_ENDPOINT =
  process.env.LLM_CHATS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/chats");

export const PLUGINS_ENDPOINT =
  process.env.LLM_PLUGINS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/plugins");

export const PUBLIC_CHATS_ENDPOINT =
  process.env.LLM_PUBLIC_CHATS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/public/chats");

export const UPLOADS_ENDPOINT =
  process.env.LLM_UPLOADS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/uploads");

export const TRANSCRIBE_ENDPOINT =
  process.env.LLM_TRANSCRIBE_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/transcribe");

export const ACCOUNT_ENDPOINT =
  process.env.LLM_ACCOUNT_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/account");

export const PROMPTS_ENDPOINT =
  process.env.LLM_PROMPTS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/prompts");

export const EVENTS_ENDPOINT =
  process.env.LLM_EVENTS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/events");

export const NOTIFICATIONS_ENDPOINT =
  process.env.LLM_NOTIFICATIONS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/notifications");

export const KEYS_ENDPOINT =
  process.env.LLM_KEYS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/account/keys");

export const TTS_ENDPOINT =
  process.env.LLM_TTS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/tts");

export const FS_ENDPOINT =
  process.env.LLM_FS_URL ??
  CHAT_STREAM_ENDPOINT.replace(/\/chat\/stream\/?$/, "/fs");
