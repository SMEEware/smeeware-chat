export type ToolArguments = Record<string, unknown>;

export type ChatComment = {
  id: string;
  text: string;
  createdAt: string;
};

export type StreamFrame =
  | { type: "reasoning"; delta: string }
  | { type: "content"; delta: string }
  | {
      type: "tool_call";
      tool: string;
      call_id: string;
      arguments?: ToolArguments;
    }
  | {
      type: "tool_result";
      tool: string;
      call_id: string;
      ok: boolean;
      preview?: string;
      length?: number;
    }
  | { type: "error"; error: { code?: string; message: string } };

export type WireMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  bytes: number;
  kind: "text" | "image";
  text?: string;
  truncated?: boolean;
  path?: string;
};

export type ToolStatus = "running" | "ok" | "error";

export type ToolPart = {
  type: "tool";
  callId: string;
  tool: string;
  arguments?: ToolArguments;
  status: ToolStatus;
  preview?: string;
  length?: number;
};

export type MessagePart =
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | ToolPart;

export type ChatMessage = WireMessage & {
  id: string;
  parts?: MessagePart[];
  reasoning?: string;
  model?: string;
  streaming?: boolean;
  aborted?: boolean;
  interrupted?: boolean;
  durationMs?: number;
  attachments?: Attachment[];
  comments?: ChatComment[];
  hidden?: boolean;
};

export type ChatRequestBody = {
  messages: WireMessage[];
  model?: string | null;
  max_tokens?: number;
  prompt?: string | null;
  tools?: boolean;
  voice_id?: string;
  tts_model?: string;
};

export type Model = {
  id: string;
  name: string;
  description: string;
  group: string;
  runtime: "hosted" | "local" | "openai";
  reasoning_effort?: string | null;
  gated?: boolean;
};

export type ModelList = {
  count: number;
  default: string;
  groups: string[];
  models: Model[];
};

export type SttModel = {
  id: string;
  name: string;
  description: string;
  group: string;
  runtime: "openai" | "local";
};

export type SttModelList = {
  count: number;
  default: string;
  groups: string[];
  models: SttModel[];
};

export type TtsModel = {
  id: string;
  name: string;
  description: string;
  group: string;
  runtime: "elevenlabs" | "free";
};

export type TtsModelList = {
  count: number;
  default: string;
  groups: string[];
  models: TtsModel[];
  default_voice: string;
};

export type ChatSummary = {
  id: string;
  title: string;
  model: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
  public?: boolean;
};

export type ChatDetail = ChatSummary & {
  messages: ChatMessage[];
};

export type ChatListResponse = {
  count: number;
  chats: ChatSummary[];
};
