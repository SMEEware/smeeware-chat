import type {
  ChatDetail,
  ChatListResponse,
  ChatMessage,
  ChatSummary,
} from "@/lib/chat/types";

const BASE = "/api/chats";

export class ChatNotFound extends Error {
  constructor(id: string) {
    super(`No stored chat for ${id}.`);
    this.name = "ChatNotFound";
  }
}

export class NotAuthenticated extends Error {
  constructor(message = "Your session has expired.") {
    super(message);
    this.name = "NotAuthenticated";
  }
}

async function fehler(response: Response): Promise<never> {
  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    message = payload?.error?.message ?? message;
  } catch {
  }
  if (response.status === 401) throw new NotAuthenticated(message);
  throw new Error(message);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) await fehler(response);
  return (await response.json()) as T;
}

export async function fetchChats(signal?: AbortSignal): Promise<ChatSummary[]> {
  const response = await fetch(`${BASE}?limit=200`, {
    cache: "no-store",
    signal,
  });
  return (await json<ChatListResponse>(response)).chats ?? [];
}

export async function fetchChat(
  id: string,
  signal?: AbortSignal,
): Promise<ChatDetail> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 404) throw new ChatNotFound(id);

  const detail = await json<ChatDetail>(response);
  return { ...detail, messages: fromStored(detail.messages) };
}

export async function saveChat(
  id: string,
  body: { messages: ChatMessage[]; model?: string | null; title?: string },
): Promise<ChatDetail> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: toStored(body.messages),
      model: body.model ?? undefined,
      title: body.title,
    }),
  });
  return json<ChatDetail>(response);
}

export async function renameChat(
  id: string,
  title: string,
): Promise<ChatDetail> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return json<ChatDetail>(response);
}

export async function deleteChat(id: string): Promise<void> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) await fehler(response);
}

export async function setChatPublic(
  id: string,
  oeffentlich: boolean,
): Promise<void> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}/share`, {
    method: oeffentlich ? "POST" : "DELETE",
  });
  if (!response.ok) await fehler(response);
}

export async function fetchPublicChat(
  id: string,
  signal?: AbortSignal,
): Promise<ChatDetail> {
  const response = await fetch(`/api/public/chats/${encodeURIComponent(id)}`, {
    signal,
    cache: "no-store",
  });
  if (response.status === 404) throw new ChatNotFound(id);
  if (!response.ok) await fehler(response);
  return (await response.json()) as ChatDetail;
}

export async function deleteAllChats(): Promise<number> {
  const response = await fetch(BASE, { method: "DELETE" });
  if (!response.ok) await fehler(response);
  const nutzlast = (await response.json()) as { deleted?: number };
  return nutzlast.deleted ?? 0;
}

export function toStored(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(
      (message) =>
        message.content.trim().length > 0 || (message.parts?.length ?? 0) > 0,
    )
    .map((message) => {
      const kopie: ChatMessage = { ...message };
      if (message.streaming || message.interrupted) kopie.interrupted = true;
      else delete kopie.interrupted;
      delete kopie.streaming;
      return kopie;
    });
}

export function fromStored(messages: ChatMessage[] | undefined): ChatMessage[] {
  return (messages ?? []).map((message, index) => ({
    ...message,
    id: message.id ?? `gespeichert-${index}`,
    streaming: false,
  }));
}

export function leererChat(id: string): ChatDetail {
  const jetzt = new Date().toISOString();
  return {
    id,
    title: "New chat",
    model: null,
    message_count: 0,
    created_at: jetzt,
    updated_at: jetzt,
    messages: [],
  };
}

export function newChatId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
