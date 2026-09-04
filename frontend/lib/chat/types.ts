/** Argumente eines Werkzeugaufrufs -- beliebiges JSON-Objekt. */
export type ToolArguments = Record<string, unknown>;

/**
 * A user note attached to a message -- pure client-side metadata.
 *
 * It is not part of ``WireMessage``: comments never reach the model, but
 * they are persisted with the chat because the backend passes extra fields
 * through unchanged (like ``parts`` or ``model``).
 */
export type ChatComment = {
  id: string;
  text: string;
  /** ISO timestamp -- display only, never used for sorting. */
  createdAt: string;
};

/** Was das Backend pro SSE-Frame schickt. */
export type StreamFrame =
  | { type: "reasoning"; delta: string }
  | { type: "content"; delta: string }
  // Werkzeug startet. Ueber call_id mit dem tool_result verknuepfen.
  | {
      type: "tool_call";
      tool: string;
      call_id: string;
      arguments?: ToolArguments;
    }
  // Werkzeug fertig. ok:false = gescheitert, preview traegt dann den Fehler.
  | {
      type: "tool_result";
      tool: string;
      call_id: string;
      ok: boolean;
      preview?: string;
      length?: number;
    }
  | { type: "error"; error: { code?: string; message: string } };

/** Was auf der Leitung landet -- reasoning wandert nie zurueck zum Backend. */
export type WireMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Eine Datei am Prompt. Zwei Sorten, weil zwei Wege:
 *
 * "text" traegt seinen Inhalt selbst -- er wird beim Absenden in die
 * Nachricht gefaltet und braucht das Backend nie zu sehen.
 *
 * "image" traegt nur eine Adresse. Das Hauptmodell sieht keine Bilder; es
 * bekommt den Pfad und reicht ihn an ``analyze_image`` weiter, wenn es
 * hinsehen will.
 */
export type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  bytes: number;
  kind: "text" | "image";
  /** Nur "text": der eingebettete Inhalt, schon auf das Limit gekuerzt. */
  text?: string;
  /** Nur "text": true, wenn beim Lesen gekuerzt wurde. */
  truncated?: boolean;
  /** Nur "image": Pfad auf der Maschine des Backends, fuer analyze_image. */
  path?: string;
};

export type ToolStatus = "running" | "ok" | "error";

/** Ein Werkzeugaufruf im Verlauf -- vom Start bis zum Ergebnis. */
export type ToolPart = {
  type: "tool";
  /** Verknuepft tool_call und tool_result. */
  callId: string;
  tool: string;
  arguments?: ToolArguments;
  status: ToolStatus;
  /** Einzeilige Statuszeile aus dem tool_result (bei Fehler: die Meldung). */
  preview?: string;
  /** Volle Zeichenzahl des Ergebnisses -- das Ergebnis selbst kommt nicht. */
  length?: number;
};

/**
 * Eine Assistenz-Antwort ist eine Folge von Abschnitten: sichtbarer Text,
 * Denkpausen und Werkzeugaufrufe. Die Reihenfolge zaehlt -- nur so laesst
 * sich jedes Ereignis an genau der Stelle im Verlauf zeigen, an der es
 * passiert ist.
 */
export type MessagePart =
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | ToolPart;

export type ChatMessage = WireMessage & {
  id: string;
  /** Geordnete Abschnitte der Antwort -- Text und Denkpausen im Wechsel. */
  parts?: MessagePart[];
  /** Gedankengang, nur zur Anzeige. @deprecated -- ersetzt durch parts. */
  reasoning?: string;
  /** Modell, das diese Antwort erzeugt hat (nur bei Assistenz-Nachrichten). */
  model?: string;
  /** Laeuft der Stream fuer diese Nachricht gerade? */
  streaming?: boolean;
  /** Vom Nutzer per Stop-Button beendet. */
  aborted?: boolean;
  /**
   * Der Turn lief noch, als zuletzt gespeichert wurde -- der Browser ist
   * dazwischen verschwunden. Was hier steht, ist alles, was ankam.
   */
  interrupted?: boolean;
  /** Dauer des Turns in ms, sobald er fertig ist. */
  durationMs?: number;
  /** Files attached to this question (user messages only). */
  attachments?: Attachment[];
  /** Private user notes on this message. */
  comments?: ChatComment[];
};

export type ChatRequestBody = {
  messages: WireMessage[];
  /** id aus GET /models. Fehlt = Backend nimmt sein Default-Modell. */
  model?: string | null;
  max_tokens?: number;
  /** Dateiname ohne Endung aus prompts/. Fehlt = DEFAULT_PROMPT. */
  prompt?: string | null;
  /** false haengt dem Modell keine Werkzeuge an. Fehlt = an. */
  tools?: boolean;
  /** Stimme fuers Vorlesen (read_aloud). Leer/fehlt = Vorgabe der .env. */
  voice_id?: string;
  /** Sprach-Modell fuers Vorlesen. id aus GET /tts/models. Fehlt = Vorgabe. */
  tts_model?: string;
};

/** Ein waehlbares Modell aus GET /models. */
export type Model = {
  id: string;
  name: string;
  description: string;
  /** Ueberschrift im Auswahlfeld: "OpenAI", "DeepSeek", "Local". */
  group: string;
  /** Wo es laeuft. "local" heisst: verlaesst die Maschine nicht. */
  runtime: "hosted" | "local" | "openai";
  /** Wie viel es denkt. Nur bei den Reasoning-Modellen gesetzt. */
  reasoning_effort?: string | null;
  /** Braucht eine Freischaltung beim Anbieter -- waehlbar, aber mit Hinweis. */
  gated?: boolean;
};

/** Antwort von GET /models. */
export type ModelList = {
  count: number;
  default: string;
  /** Reihenfolge der Ueberschriften -- vom Backend vorgegeben. */
  groups: string[];
  models: Model[];
};

/** Ein waehlbares Transkriptions-Modell aus GET /transcribe/models. */
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

/** Ein waehlbares Sprach-Modell aus GET /tts/models. */
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
  /** Die Vorgabe-Stimme -- Platzhalter im Stimmen-Feld. */
  default_voice: string;
};

/** Zusammenfassung eines gespeicherten Chats -- was die Liste braucht. */
export type ChatSummary = {
  id: string;
  title: string;
  model: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * Ein gespeicherter Chat samt Verlauf. Das Backend reicht die Nachrichten
 * unveraendert durch (StoredMessage erlaubt Zusatzfelder), deshalb kommen
 * parts, model und durationMs genau so zurueck, wie sie hingegangen sind.
 */
export type ChatDetail = ChatSummary & {
  messages: ChatMessage[];
};

export type ChatListResponse = {
  count: number;
  chats: ChatSummary[];
};
