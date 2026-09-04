import type { HttpMethod } from "@/lib/docs/navigation";

export type DocBlock =
  | { type: "lead"; text: string }
  | { type: "auth-link"; text: string; label: string; href: string }
  | { type: "heading"; id: string; title: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; language: string; filename?: string; code: string }
  | {
      type: "tabs";
      tabs: { label: string; language: string; code: string }[];
    }
  | {
      type: "callout";
      variant: "info" | "warning";
      title: string;
      text: string;
    }
  | { type: "steps"; steps: { title: string; text: string }[] }
  | {
      type: "params";
      rows: {
        name: string;
        type: string;
        required?: boolean;
        text: string;
      }[];
    }
  | { type: "responses"; rows: { status: string; text: string }[] }
  | { type: "cards"; cards: { title: string; text: string; href: string }[] }
  | { type: "endpoint"; method: HttpMethod; path: string };

const PLACEHOLDER =
  "Placeholder text. The real explanation goes here later — structure, edge cases, and an example to follow along with.";

const PLACEHOLDER_SHORT =
  "Placeholder text, replaced later by the real section.";

const curlSample = `curl https://api.smeeware.dev/v1/chat \\
  -H "Authorization: Bearer $SMEEWARE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'`;

const tsSample = `import { Smeeware } from "@smeeware/sdk";

const client = new Smeeware({
  apiKey: process.env.SMEEWARE_API_KEY,
});

const response = await client.chat.create({
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.content);`;

const pySample = `from smeeware import Smeeware

client = Smeeware(api_key=os.environ["SMEEWARE_API_KEY"])

response = client.chat.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.content)`;

const requestTabs: DocBlock = {
  type: "tabs",
  tabs: [
    { label: "cURL", language: "bash", code: curlSample },
    { label: "TypeScript", language: "ts", code: tsSample },
    { label: "Python", language: "py", code: pySample },
  ],
};

export const docsContent: Record<string, DocBlock[]> = {
  "chat/commands": [
    {
      type: "lead",
      text: "Every action in the chat lives in one catalog. Two surfaces read it: the command palette and the slash menu. They can never drift apart, because there is only one list behind both.",
    },
    { type: "heading", id: "palette", title: "The command palette" },
    {
      type: "paragraph",
      text: "Press ⌘K (Ctrl+K on Windows and Linux) anywhere in the chat to open the palette. It shows the whole catalog — grouped by purpose — plus your open chats, your workspaces, and your personas. Start typing to filter across labels, descriptions and keywords at once.",
    },
    {
      type: "callout",
      variant: "info",
      title: "Dynamic groups",
      text: "Some groups are filled at runtime: your Chats, Workspaces and Personas, the Answer / Transcription / Read-aloud model pickers, and “Reference a chat”. Selecting a persona switches the system prompt, a model switches what answers, and a referenced chat pulls its transcript into the box as context.",
    },
    { type: "heading", id: "slash", title: "The slash menu" },
    {
      type: "paragraph",
      text: "Type / at the start of a word in the message box to open the slash menu. It carries the quick, in-flow commands: actions like /new, /attach and /record, and templates like /prompt, /spec, /plan and /image. Arrow keys move, Enter runs, Esc closes.",
    },
    {
      type: "paragraph",
      text: "Templates do not send anything on their own. They drop a fill-in scaffold into the message box; you replace the placeholders and send, and the model turns your notes into the finished prompt, spec, plan or image request.",
    },
    { type: "heading", id: "groups", title: "How commands are grouped" },
    {
      type: "params",
      rows: [
        { name: "Chat", type: "group", text: "Start, share and manage conversations." },
        { name: "Compose", type: "group", text: "Drop a ready-made template into the message." },
        { name: "Context", type: "group", text: "The workspace and references the model works from." },
        { name: "Input", type: "group", text: "Bring files and voice into the message." },
        { name: "Models", type: "group", text: "Pick what answers, transcribes and speaks." },
        { name: "Personas", type: "group", text: "Swap the system prompt behind the answers." },
        { name: "Preferences", type: "group", text: "Thinking, tools, notifications and theme." },
        { name: "Go to", type: "group", text: "Jump to the docs, account and settings." },
        { name: "Access", type: "group", text: "Keys for the API." },
      ],
    },
    { type: "heading", id: "shortcuts", title: "Keyboard shortcuts" },
    {
      type: "params",
      rows: [
        { name: "⌘K", type: "shortcut", text: "Open the command palette." },
        { name: "⌘J", type: "shortcut", text: "Start a new chat." },
        { name: "⌘O", type: "shortcut", text: "Attach files." },
        { name: "⌘I", type: "shortcut", text: "Start voice recording." },
      ],
    },
    {
      type: "paragraph",
      text: "The shortcut list in the sidebar footer is generated from the same catalog, so a key printed there always matches what the command actually does.",
    },
  ],
  "chat/workspaces": [
    {
      type: "lead",
      text: "A workspace is the context you are working in — a project, a folder, a set of notes. The active workspace rides along with every message, so the model always knows which project and path you mean.",
    },
    { type: "heading", id: "add", title: "Create a workspace" },
    {
      type: "steps",
      steps: [
        {
          title: "Open the manager",
          text: "Click the folder pill in the message bar, run “Workspaces” from the palette, or type /workspace.",
        },
        {
          title: "Pick a folder",
          text: "Give it a name and notes, then Browse. The browser lists the folders on the machine the agent runs on — locally that's your computer, deployed it's the agent's host — so the path always points somewhere the agent's tools can reach. You can also paste an absolute path.",
        },
        {
          title: "Make it active",
          text: "The first workspace you add becomes active automatically. Click any workspace to activate it; click the active one again to work with no context.",
        },
      ],
    },
    { type: "heading", id: "context", title: "How it reaches the model" },
    {
      type: "paragraph",
      text: "The active workspace is attached to your latest message as a short context block — name, path and notes — right before the request goes out. It is never stored in the transcript, so switching workspaces mid-conversation always reflects the one active right now.",
    },
    {
      type: "code",
      language: "text",
      filename: "what the model receives",
      code: `[active workspace]
Name: Smeeware Chat
Path: /Users/you/dev/smeeware-chat
Notes: Next.js frontend, FastAPI backend. Keep the two independent.
Treat this as the working context for the request.`,
    },
    {
      type: "callout",
      variant: "info",
      title: "Where they live",
      text: "Your list of workspaces lives in your browser, next to your other preferences — the context travels as text with each message. The folder browser reads the agent's host over an authenticated endpoint (GET /fs), listing directories only, never file contents.",
    },
  ],
  "": [
    {
      type: "lead",
      text: "The Smeeware API answers chat requests as a stream. These docs take you from your first call to the full endpoint reference.",
    },
    {
      type: "cards",
      cards: [
        {
          title: "Quickstart",
          text: "Your first call in under five minutes.",
          href: "/docs/getting-started",
        },
        {
          title: "Authentication",
          text: "Create keys and use them safely.",
          href: "/docs/authentication",
        },
        {
          title: "Streaming",
          text: "Process answers token by token.",
          href: "/docs/streaming",
        },
        {
          title: "Endpoints",
          text: "Every route with parameters and examples.",
          href: "/docs/endpoints",
        },
      ],
    },
    { type: "heading", id: "aufbau", title: "How the docs are organized" },
    { type: "paragraph", text: PLACEHOLDER },
    { type: "paragraph", text: PLACEHOLDER_SHORT },
    { type: "heading", id: "konventionen", title: "Conventions" },
    { type: "paragraph", text: PLACEHOLDER },
    {
      type: "callout",
      variant: "info",
      title: "Work in progress",
      text: "All copy is placeholder. Structure, navigation, and examples are already in place.",
    },
  ],

  "getting-started": [
    {
      type: "lead",
      text: "From an empty project to your first streamed answer — three steps, no setup beyond an API key.",
    },
    { type: "heading", id: "voraussetzungen", title: "Prerequisites" },
    { type: "paragraph", text: PLACEHOLDER },
    {
      type: "steps",
      steps: [
        {
          title: "Create a key",
          text: "Create a new key in the dashboard under Settings → API keys.",
        },
        {
          title: "Set an environment variable",
          text: "Store the key as SMEEWARE_API_KEY, never directly in source.",
        },
        {
          title: "Send your first call",
          text: "Copy the example below and run it — the answer comes back as a stream.",
        },
      ],
    },
    { type: "heading", id: "erster-aufruf", title: "First call" },
    { type: "paragraph", text: PLACEHOLDER_SHORT },
    requestTabs,
    { type: "heading", id: "naechste-schritte", title: "Next steps" },
    { type: "paragraph", text: PLACEHOLDER },
    {
      type: "cards",
      cards: [
        {
          title: "Streaming",
          text: "Process tokens one at a time instead of waiting.",
          href: "/docs/streaming",
        },
        {
          title: "Error handling",
          text: "What to do on a timeout or a 429.",
          href: "/docs/errors",
        },
      ],
    },
  ],

  installation: [
    {
      type: "lead",
      text: "Official SDKs for TypeScript, Python, and Go, plus the CLI for local testing.",
    },
    { type: "heading", id: "paketmanager", title: "Package managers" },
    { type: "paragraph", text: PLACEHOLDER_SHORT },
    {
      type: "tabs",
      tabs: [
        { label: "npm", language: "bash", code: "npm install @smeeware/sdk" },
        { label: "pnpm", language: "bash", code: "pnpm add @smeeware/sdk" },
        { label: "bun", language: "bash", code: "bun add @smeeware/sdk" },
      ],
    },
    { type: "heading", id: "konfiguration", title: "Configuration" },
    { type: "paragraph", text: PLACEHOLDER },
    {
      type: "code",
      language: "bash",
      filename: ".env.local",
      code: `SMEEWARE_API_KEY=sk_live_placeholder
SMEEWARE_BASE_URL=https://api.smeeware.dev/v1`,
    },
    {
      type: "callout",
      variant: "warning",
      title: "Don't commit keys",
      text: "Keep .env.local in .gitignore. Rotate any accidentally published key immediately.",
    },
  ],

  authentication: [
    {
      type: "lead",
      text: "Locally the backend trusts localhost and needs no key. The moment you expose it, an API key becomes the ticket in — sent as a bearer token in the Authorization header.",
    },
    {
      type: "auth-link",
      text: "Your account is ready for external access.",
      label: "Manage API keys",
      href: "/settings?section=keys",
    },
    { type: "heading", id: "wann", title: "When keys are required" },
    {
      type: "paragraph",
      text: "Key checks are off by default so a plain curl against your own machine keeps working. Start the backend with REQUIRE_API_KEY=true and the inference endpoints (chat, transcribe, vision) begin turning away anyone without proof: either an open session — that is your own frontend — or a valid API key.",
    },
    {
      type: "code",
      language: "bash",
      code: "REQUIRE_API_KEY=true",
    },
    { type: "heading", id: "schluessel", title: "Create a key" },
    {
      type: "paragraph",
      text: "Keys belong to your account. Open Settings → API keys, create one, and copy it right then — the full key is shown exactly once. Afterwards only a hash lives in the database, so nobody, not even the server, can show it to you again. Lose it and you revoke it and make a new one.",
    },
    {
      type: "paragraph",
      text: "Every key starts with sk_smee_ so a leaked one is easy to spot. Delete a key to revoke it immediately; deleting your account takes all of its keys with it.",
    },
    { type: "heading", id: "benutzen", title: "Send it with a request" },
    {
      type: "code",
      language: "bash",
      code: `curl -N http://localhost:8000/api/v1/chat/stream \\
  -H "Authorization: Bearer sk_smee_…" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'`,
    },
    {
      type: "params",
      rows: [
        {
          name: "Authorization",
          type: "header",
          required: true,
          text: "Bearer followed by your secret key. Required on inference endpoints once REQUIRE_API_KEY is on.",
        },
        {
          name: "X-Session-Id",
          type: "header",
          text: "The frontend's own way in — its session, forwarded automatically. You won't set this by hand.",
        },
      ],
    },
    {
      type: "callout",
      variant: "warning",
      title: "Server-side only",
      text: "A key is a secret. Keep it out of client code and public repos — put it behind your own backend route and rotate any key that slips out.",
    },
  ],

  requests: [
    {
      type: "lead",
      text: "Every endpoint speaks JSON over HTTP. Shape, encoding, and response format are the same everywhere.",
    },
    { type: "heading", id: "basis-url", title: "Base URL" },
    {
      type: "paragraph",
      text: "Every path hangs off api_prefix — /api/v1 by default. In the examples the backend runs locally at http://localhost:8000.",
    },
    {
      type: "code",
      language: "bash",
      code: "http://localhost:8000/api/v1",
    },
    { type: "heading", id: "grenzen", title: "Chat body limits" },
    {
      type: "params",
      rows: [
        {
          name: "messages",
          type: "array · 1–100",
          text: "role is system | user | assistant, content 1–32000 characters.",
        },
        {
          name: "temperature",
          type: "number · 0–2",
          text: "null = default from configuration.",
        },
        {
          name: "max_tokens",
          type: "integer · 1–32000",
          text: "Counts thinking tokens on reasoning models.",
        },
        {
          name: "top_p",
          type: "number · >0–1",
          text: "null = default.",
        },
      ],
    },
    { type: "heading", id: "zustandslos", title: "Stateless" },
    {
      type: "paragraph",
      text: "The backend remembers nothing between requests — send the full history with every chat call.",
    },
  ],

  streaming: [
    {
      type: "lead",
      text: "Instead of waiting for the full answer, the API delivers Server-Sent Events — token by token.",
    },
    { type: "heading", id: "aktivieren", title: "Endpoint" },
    {
      type: "paragraph",
      text: "Streaming runs over POST /api/v1/chat/stream with the same body as /chat. The response is a text/event-stream of data: lines, each a JSON frame with a type, terminated by data: [DONE].",
    },
    {
      type: "code",
      language: "ts",
      filename: "stream.ts",
      code: `for await (const frame of parseSse(response.body)) {
  if (frame.type === "reasoning") appendReasoning(frame.delta);
  else if (frame.type === "content") appendContent(frame.delta);
  else if (frame.type === "tool_call") startTool(frame);
  else if (frame.type === "tool_result") finishTool(frame);
}`,
    },
    { type: "heading", id: "reihenfolge", title: "Order" },
    {
      type: "paragraph",
      text: "reasoning* → (tool_call → tool_result)* → content* → [DONE]. Multiple rounds are normal. Always link tool_call and tool_result by call_id, never by order.",
    },
    { type: "heading", id: "frames", title: "Frame types" },
    {
      type: "params",
      rows: [
        {
          name: "reasoning",
          type: "{ delta }",
          text: "The model's reasoning (reasoning models only, comes first). Kept separate from the content.",
        },
        {
          name: "content",
          type: "{ delta }",
          text: "A chunk of the visible answer. Appended continuously and rendered as Markdown.",
        },
        {
          name: "tool_call",
          type: "{ tool, call_id, arguments }",
          text: "A tool is being called. arguments is an object.",
        },
        {
          name: "tool_result",
          type: "{ tool, call_id, ok, preview, length }",
          text: "Result. ok=false = failure, preview then carries the message.",
        },
        {
          name: "error",
          type: "event: error",
          text: "Error after the stream started — as its own event: error event; the stream ends afterwards.",
        },
      ],
    },
    {
      type: "callout",
      variant: "info",
      title: "Aborting",
      text: "An AbortController ends the stream cleanly; tokens already received stay valid.",
    },
  ],

  errors: [
    {
      type: "lead",
      text: "Errors before the first byte come as an HTTP status; errors mid-stream come as a frame.",
    },
    { type: "heading", id: "envelope", title: "Error envelope" },
    {
      type: "paragraph",
      text: "Every error comes in the same shape. details is optional and only set on body validation.",
    },
    {
      type: "code",
      language: "json",
      code: `{
  "error": {
    "code": "validation_error",
    "message": "The request is invalid.",
    "details": { "fields": [] }
  }
}`,
    },
    { type: "heading", id: "codes", title: "Codes" },
    {
      type: "params",
      rows: [
        {
          name: "validation_error",
          type: "422",
          text: "Invalid body or parameter, empty or corrupt image file.",
        },
        {
          name: "unauthorized",
          type: "401",
          text: "Authentication missing or invalid.",
        },
        {
          name: "rate_limited",
          type: "429",
          text: "Provider quota exhausted.",
        },
        {
          name: "configuration_error",
          type: "500",
          text: "Misconfiguration, e.g. VISION_ENABLED=false on a vision call.",
        },
        {
          name: "internal_error",
          type: "500",
          text: "Unexpected error in the backend.",
        },
        {
          name: "provider_error",
          type: "502",
          text: "Upstream returns nothing usable.",
        },
        {
          name: "provider_timeout",
          type: "504",
          text: "Upstream is too slow.",
        },
      ],
    },
    { type: "heading", id: "stream", title: "In the stream" },
    {
      type: "paragraph",
      text: "On /chat/stream the error does not come as an HTTP status (that is 200 by then) but as an event: error frame with the same error object.",
    },
  ],

  "rate-limits": [
    {
      type: "lead",
      text: "Quotas apply per key and are reported back through response headers.",
    },
    { type: "heading", id: "header", title: "Headers" },
    {
      type: "params",
      rows: [
        {
          name: "X-RateLimit-Limit",
          type: "integer",
          text: "Requests allowed in the current window.",
        },
        {
          name: "X-RateLimit-Remaining",
          type: "integer",
          text: "Requests remaining in the current window.",
        },
        {
          name: "Retry-After",
          type: "seconds",
          text: "How long to wait after a 429 before retrying.",
        },
      ],
    },
    { type: "heading", id: "kontingente", title: "Quotas" },
    { type: "paragraph", text: PLACEHOLDER },
  ],

  endpoints: [
    {
      type: "lead",
      text: "Every endpoint lives under the base /api/v1. The backend is stateless — the full history goes with every chat call.",
    },
    {
      type: "cards",
      cards: [
        {
          title: "GET /api/v1/health",
          text: "Liveness — is the process running?",
          href: "/docs/endpoints/health",
        },
        {
          title: "GET /api/v1/ready",
          text: "Readiness — is the LLM provider reachable?",
          href: "/docs/endpoints/ready",
        },
        {
          title: "POST /api/v1/chat",
          text: "Answer in one piece as JSON.",
          href: "/docs/endpoints/chat",
        },
        {
          title: "POST /api/v1/chat/stream",
          text: "Answer as SSE — thinking, tools, answer.",
          href: "/docs/endpoints/chat-stream",
        },
        {
          title: "GET /api/v1/models",
          text: "The models /chat accepts.",
          href: "/docs/endpoints/models",
        },
        {
          title: "GET /api/v1/tools",
          text: "Every registered tool with its schema.",
          href: "/docs/endpoints/tools",
        },
        {
          title: "POST /api/v1/vision",
          text: "Look at images by address (JSON).",
          href: "/docs/endpoints/vision",
        },
        {
          title: "POST /api/v1/vision/upload",
          text: "Look at uploaded image files (multipart).",
          href: "/docs/endpoints/vision-upload",
        },
        {
          title: "GET /api/v1/prompts",
          text: "List system prompts.",
          href: "/docs/endpoints/prompts",
        },
        {
          title: "GET /api/v1/prompts/{name}",
          text: "Fetch one prompt verbatim.",
          href: "/docs/endpoints/prompt",
        },
      ],
    },
    { type: "heading", id: "basis", title: "Base URL" },
    {
      type: "paragraph",
      text: "Every path hangs off api_prefix — /api/v1 by default. In the examples the backend runs locally at http://localhost:8000.",
    },
    {
      type: "callout",
      variant: "info",
      title: "Non-production only",
      text: "GET /docs (Swagger UI) and GET /openapi.json are only available when the environment is not production.",
    },
  ],

  "endpoints/chat": [
    { type: "endpoint", method: "POST", path: "/api/v1/chat" },
    {
      type: "lead",
      text: "Takes the full history and produces the next answer in one piece. Tools run internally in the agent loop — this response shows only the final result; the intermediate steps are visible only in the stream.",
    },
    { type: "heading", id: "parameter", title: "Parameters" },
    {
      type: "params",
      rows: [
        {
          name: "messages",
          type: "Message[] · 1–100",
          required: true,
          text: "The full history in order. Each message has a role (system | user | assistant) and content (1–32000 characters).",
        },
        {
          name: "model",
          type: "string | null",
          text: "An id from GET /models. null = default from the backend configuration.",
        },
        {
          name: "temperature",
          type: "number | null · 0–2",
          text: "Creativity. Lower = more predictable. null = default.",
        },
        {
          name: "max_tokens",
          type: "integer | null · 1–32000",
          text: "Upper bound on answer length incl. thinking tokens. null = default.",
        },
        {
          name: "top_p",
          type: "number | null · >0–1",
          text: "Nucleus sampling. null = default.",
        },
        {
          name: "voice_id",
          type: "string | null",
          text: "For read_aloud: the ElevenLabs voice to speak with. null = the configured default. The model never picks this — the caller does.",
        },
        {
          name: "tts_model",
          type: "string | null",
          text: "For read_aloud: an id from GET /tts/models. null = the configured default.",
        },
      ],
    },
    {
      type: "callout",
      variant: "warning",
      title: "Reasoning model",
      text: "A small max_tokens counts thinking tokens too and can return an empty answer. When in doubt, send null.",
    },
    { type: "heading", id: "beispiel", title: "Example request" },
    {
      type: "code",
      language: "json",
      code: `{
  "messages": [
    { "role": "system", "content": "You are concise and precise." },
    { "role": "user", "content": "Explain SSE in two sentences." }
  ],
  "temperature": 0.7,
  "max_tokens": 500
}`,
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "content": "Server-Sent Events are a one-way channel over which the server continuously pushes text to the browser across an open HTTP connection. Unlike WebSockets, it is purely server-side and runs over ordinary HTTP.",
  "model": "deepseek-v4-flash",
  "finish_reason": "stop",
  "reasoning": "The user wants a short explanation …",
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 58,
    "total_tokens": 100,
    "reasoning_tokens": 20
  }
}`,
    },
    {
      type: "paragraph",
      text: "reasoning is only filled on reasoning models, otherwise null. usage can be null if the provider returns nothing.",
    },
    {
      type: "responses",
      rows: [
        { status: "200", text: "Answer generated." },
        { status: "422", text: "Invalid body or parameter." },
        { status: "429", text: "Provider quota exhausted." },
      ],
    },
  ],

  "endpoints/chat-stream": [
    { type: "endpoint", method: "POST", path: "/api/v1/chat/stream" },
    {
      type: "lead",
      text: "Same request body as /chat, but the response is a text/event-stream. Only this way do thinking, tool calls, and the answer arrive live token by token — always use this endpoint for the chat UI.",
    },
    { type: "heading", id: "format", title: "Frame format" },
    {
      type: "paragraph",
      text: "Each frame is a line data: {json}, separated by blank lines. Each JSON carries a type. The stream always ends with data: [DONE].",
    },
    { type: "heading", id: "frames", title: "Frame types" },
    {
      type: "params",
      rows: [
        {
          name: "reasoning",
          type: "{ delta }",
          text: "Model is thinking (reasoning models only, comes first). Append delta, show it greyed out / collapsed.",
        },
        {
          name: "content",
          type: "{ delta }",
          text: "A chunk of the actual answer. Append delta and render as Markdown.",
        },
        {
          name: "tool_call",
          type: "{ tool, call_id, arguments }",
          text: "A tool is being called. arguments is an object for a readable line.",
        },
        {
          name: "tool_result",
          type: "{ tool, call_id, ok, preview, length }",
          text: "Result. ok=false = failure (red), preview = message. Link to the tool_call by call_id, not by order.",
        },
        {
          name: "error",
          type: "event: error · { error: { code, message } }",
          text: "Abort after the stream started — as its own event: error event.",
        },
      ],
    },
    { type: "heading", id: "beispiel", title: "Example stream" },
    {
      type: "code",
      language: "text",
      code: `data: {"type":"reasoning","delta":"I should search first …"}

data: {"type":"tool_call","tool":"web_search","call_id":"call_01","arguments":{"query":"current SSE specification"}}

data: {"type":"tool_result","tool":"web_search","call_id":"call_01","ok":true,"preview":"1. WHATWG HTML Living Standard … 2. MDN …","length":1840}

data: {"type":"content","delta":"Server-Sent Events "}

data: {"type":"content","delta":"are a one-way channel …"}

data: [DONE]`,
    },
    { type: "heading", id: "fehler", title: "Errors mid-stream" },
    {
      type: "paragraph",
      text: "The HTTP status is already 200, so the error arrives as event: error with the same error object as everywhere else.",
    },
    {
      type: "code",
      language: "text",
      code: `event: error
data: {"type":"error","error":{"code":"provider_timeout","message":"The upstream provider did not respond in time."}}

data: [DONE]`,
    },
  ],

  "endpoints/models": [
    { type: "endpoint", method: "GET", path: "/api/v1/models" },
    {
      type: "lead",
      text: "Returns the models that /chat and /chat/stream accept as model. No parameters.",
    },
    { type: "heading", id: "response", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "count": 9,
  "default": "deepseek-v4-flash",
  "groups": ["OpenAI", "DeepSeek", "Local"],
  "models": [
    {
      "id": "gpt-5.6-sol",
      "name": "GPT-5.6 Sol",
      "description": "Flagship for complex work — reasons hard, uses every tool.",
      "group": "OpenAI",
      "runtime": "openai",
      "reasoning_effort": "high",
      "gated": false
    },
    {
      "id": "gpt-5.6-cyber",
      "name": "GPT-5.6 Cyber",
      "description": "Security model for authorised vulnerability research.",
      "group": "OpenAI",
      "runtime": "openai",
      "reasoning_effort": "high",
      "gated": true
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "description": "Fast and inexpensive — the default for chat.",
      "group": "DeepSeek",
      "runtime": "hosted",
      "reasoning_effort": null,
      "gated": false
    },
    {
      "id": "qwen3",
      "name": "qwen3:8b",
      "description": "Runs locally through Ollama — nothing leaves the machine.",
      "group": "Local",
      "runtime": "local",
      "reasoning_effort": null,
      "gated": false
    }
  ]
}`,
    },
    { type: "heading", id: "fields", title: "Fields" },
    {
      type: "params",
      rows: [
        {
          name: "count",
          type: "integer",
          text: "Number of models in the list.",
        },
        {
          name: "default",
          type: "string",
          text: "The id /chat uses when no model is given (deepseek-v4-flash).",
        },
        {
          name: "models[].id",
          type: "string",
          text: "Exactly the value you send as model in the /chat body. Short and stable — a local model is addressed by its short name, not by its full Ollama tag. An unknown id gets a 422 that lists the known ones.",
        },
        {
          name: "models[].name",
          type: "string",
          text: "Display name for the model picker in the frontend.",
        },
        {
          name: "models[].description",
          type: "string",
          text: "Short description shown next to the name.",
        },
        {
          name: "groups",
          type: "string[]",
          text: "The provider headings, in the order the picker should show them. Derived from the catalogue, so a new provider appears here on its own.",
        },
        {
          name: "models[].group",
          type: "string",
          text: "Which heading this model belongs under — OpenAI, DeepSeek or Local.",
        },
        {
          name: "models[].runtime",
          type: "string",
          text: "Where it runs: openai (Responses API), hosted (the provider from LLM_PROVIDER) or local (Ollama). local is the one where nothing leaves the machine.",
        },
        {
          name: "models[].reasoning_effort",
          type: "string | null",
          text: "How hard the model thinks before answering — none, low, medium, high, xhigh or max. Only set for the OpenAI models; null everywhere else.",
        },
        {
          name: "models[].gated",
          type: "boolean",
          text: "true when OpenAI has to approve your account for this model first. It stays in the list — the key is there, only the approval is missing — but a request will come back with 'model does not exist' until it is granted.",
        },
      ],
    },
    {
      type: "paragraph",
      text: "The list is filtered to what can actually run: without OPENAI_API_KEY the whole OpenAI group is gone, and the Local one only appears when Ollama is enabled (OLLAMA_ENABLED=true), a model is named (OLLAMA_MODEL) and that Ollama is reachable. The local entry's id and tag come straight from OLLAMA_MODEL, so pick a model that can think and call tools. A model that is offered here will not fail on the key.",
    },
    { type: "heading", id: "usage", title: "Using it with /chat" },
    {
      type: "paragraph",
      text: "Take an id from this list and send it as model in the chat request.",
    },
    {
      type: "code",
      language: "json",
      code: `{ "messages": [{ "role": "user", "content": "Hi" }], "model": "deepseek-v4-pro" }`,
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "List retrieved successfully." }],
    },
  ],

  "endpoints/tools": [
    { type: "endpoint", method: "GET", path: "/api/v1/tools" },
    {
      type: "lead",
      text: "Lists every registered tool with name, description, and JSON schema of its parameters. No parameters.",
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "count": 24,
  "tools": [
    {
      "name": "web_search",
      "description": "Searches the web and returns title, URL, and snippet …",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "Search term" }
        },
        "required": ["query"]
      }
    },
    {
      "name": "analyze_image",
      "description": "Looks at one or more images and answers a question about them.",
      "parameters": {
        "type": "object",
        "properties": {
          "images": { "type": "array", "items": { "type": "string" } },
          "question": { "type": "string" }
        },
        "required": ["images"]
      }
    }
  ]
}`,
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "List retrieved successfully." }],
    },
  ],

  "endpoints/health": [
    { type: "endpoint", method: "GET", path: "/api/v1/health" },
    {
      type: "lead",
      text: "Liveness check without upstream: is the process running? Lightweight, for status indicators and uptime checks. No parameters.",
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{ "status": "ok", "version": "1.0.0", "environment": "development" }`,
    },
    {
      type: "paragraph",
      text: "status is always ok here as long as the process runs.",
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "Process is running." }],
    },
    {
      type: "callout",
      variant: "info",
      title: "Visible in the chat",
      text: "The dot in the chat header polls exactly this endpoint at regular intervals.",
    },
  ],

  "endpoints/ready": [
    { type: "endpoint", method: "GET", path: "/api/v1/ready" },
    {
      type: "lead",
      text: "Readiness check: is the service ready to accept requests? Actually pings the LLM provider. No parameters.",
    },
    { type: "heading", id: "antwort", title: "Response (reachable)" },
    {
      type: "code",
      language: "json",
      code: `{
  "status": "ok",
  "version": "1.0.0",
  "environment": "development",
  "provider": "deepseek",
  "provider_reachable": true
}`,
    },
    { type: "heading", id: "degraded", title: "Provider unreachable" },
    {
      type: "paragraph",
      text: "If the upstream does not answer, status becomes degraded and provider_reachable false — the HTTP status stays 200 regardless.",
    },
    {
      type: "code",
      language: "json",
      code: `{ "status": "degraded", "provider_reachable": false }`,
    },
    {
      type: "callout",
      variant: "info",
      title: "Read the status, not the 200",
      text: "For load balancers and deploy gates, status/provider_reachable is authoritative, not the HTTP code.",
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "Always 200 — the state is in the body." }],
    },
  ],

  "endpoints/vision": [
    { type: "endpoint", method: "POST", path: "/api/v1/vision" },
    {
      type: "lead",
      text: "Look at images by address — URL, local file path, or data URL, mixed freely. Nothing is stored; for a URL the model fetches it itself, otherwise we embed the image inline.",
    },
    { type: "heading", id: "parameter", title: "Parameters" },
    {
      type: "params",
      rows: [
        {
          name: "images",
          type: "string[] · 1–600",
          required: true,
          text: "Image addresses as URL, path, or data URL.",
        },
        {
          name: "question",
          type: "string | null · ≤8000",
          text: "Optional question about the image.",
        },
        {
          name: "detail",
          type: '"low" | "high" | "original" | "auto" | null',
          text: "Level of detail for the description.",
        },
      ],
    },
    { type: "heading", id: "beispiel", title: "Example request" },
    {
      type: "code",
      language: "json",
      code: `{
  "images": ["https://storage.smeeware.com/llm/diagramme/umsatz.png"],
  "question": "What values are on the Y axis?",
  "detail": "high"
}`,
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "answer": "The Y axis is scaled in thousands of euros, from 0 to 120 in steps of 20.",
  "model": "deepseek-v4-flash-vision-exp",
  "images": [
    {
      "source": "https://storage.smeeware.com/llm/diagramme/umsatz.png",
      "media_type": "image/png",
      "bytes": 0,
      "inlined": false
    }
  ]
}`,
    },
    {
      type: "paragraph",
      text: "inlined=false = the model fetched the URL itself (bytes is then 0). For a path or data URL we load the image and embed it → inlined=true with a real byte count.",
    },
    {
      type: "responses",
      rows: [
        { status: "200", text: "Description generated." },
        { status: "422", text: "Empty or corrupt image file." },
      ],
    },
  ],

  "endpoints/vision-upload": [
    { type: "endpoint", method: "POST", path: "/api/v1/vision/upload" },
    {
      type: "lead",
      text: "Raw image files — the path for a frontend with a file picker. multipart/form-data, nothing is stored persistently.",
    },
    { type: "heading", id: "parameter", title: "Form fields" },
    {
      type: "params",
      rows: [
        {
          name: "files",
          type: "file[] · multipart",
          required: true,
          text: "One or more images.",
        },
        {
          name: "question",
          type: "string",
          text: "Optional text field.",
        },
        {
          name: "detail",
          type: "low | high | original | auto",
          text: "Optional text field.",
        },
      ],
    },
    { type: "heading", id: "beispiel", title: "Example request" },
    {
      type: "code",
      language: "bash",
      code: `curl -X POST http://localhost:8000/api/v1/vision/upload \\
  -F "files=@screenshot.png" \\
  -F "question=What is in the image?" \\
  -F "detail=high"`,
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "answer": "A login form with email and password fields and a blue sign-in button.",
  "model": "deepseek-v4-flash-vision-exp",
  "images": [
    {
      "source": "uploaded file",
      "media_type": "image/png",
      "bytes": 48213,
      "inlined": true
    }
  ]
}`,
    },
    {
      type: "paragraph",
      text: "Uploaded bytes are always embedded → inlined=true.",
    },
    {
      type: "responses",
      rows: [
        { status: "200", text: "Description generated." },
        { status: "422", text: "Invalid format or file too large." },
      ],
    },
  ],

  attachments: [
    {
      type: "lead",
      text: "Files hang on a prompt in two different ways, because they have to. Text goes into the message; images go onto disk and only their address goes into the message.",
    },
    {
      type: "paragraph",
      text: "The reason is the main model: it does not see images. Vision is a separate service with its own model, which the agent reaches through the analyze_image tool. So an image cannot travel inside the question — but its path can, and the agent decides for itself when to look and what to ask.",
    },
    {
      type: "callout",
      variant: "info",
      title: "The chat endpoint is unchanged",
      text: "POST /api/v1/chat/stream still takes nothing but role and content. Attachments never became a field — they are folded into the text on the way to the wire.",
    },
    { type: "heading", id: "text", title: "Text files" },
    {
      type: "paragraph",
      text: "Read in the browser and appended to the question. Nothing is uploaded, nothing is stored, no endpoint is involved. Each file is capped at 12,000 characters and all of them together at 24,000 — content itself allows 32,000, and the question needs room too. A file that got cut is marked as truncated, in the composer and in the prompt.",
    },
    {
      type: "code",
      language: "text",
      filename: "what the model receives",
      code: `Why does this fail on the second run?

[attached file] notes.md (text/markdown, 2.3 KB)
--- begin notes.md ---
# Deploy notes
The cache is warmed on boot …
--- end notes.md ---`,
    },
    { type: "heading", id: "bilder", title: "Images" },
    {
      type: "paragraph",
      text: "PNG, JPEG, WebP, and GIF go to POST /api/v1/uploads and come back as a path. That path lands in the message, and the agent passes it to analyze_image when it wants to look. Base64 in the prompt would be the obvious shortcut and is a dead end: a 24 KB image already exhausts the 32,000-character limit.",
    },
    {
      type: "code",
      language: "text",
      filename: "what the model receives",
      code: `Which error is in this console?

[attached image] console.png (image/png, 245 KB)
Path on this machine: /srv/smeeware/data/uploads/a904…f5.png
Use the analyze_image tool with that path to look at it.`,
    },
    {
      type: "callout",
      variant: "warning",
      title: "The path is a local one",
      text: "It points into UPLOADS_DIR on the machine the backend runs on. Frontend and backend on separate hosts means the agent cannot open it — put the file somewhere both can reach, for example with storage_put, and hand over that URL instead.",
    },
    { type: "heading", id: "grenzen", title: "Limits" },
    {
      type: "params",
      rows: [
        {
          name: "UPLOADS_MAX_FILES",
          type: "int · default 8",
          text: "Files per request.",
        },
        {
          name: "UPLOADS_MAX_BYTES",
          type: "int · default 20000000",
          text: "Per file, 20 MB by default.",
        },
        {
          name: "UPLOADS_DIR",
          type: "path · default data/uploads",
          text: "Where the files land.",
        },
        {
          name: "UPLOADS_ENABLED",
          type: "bool · default true",
          text: "On false the endpoint answers 500 instead of taking files nobody can look at.",
        },
      ],
    },
  ],

  "endpoints/uploads": [
    { type: "endpoint", method: "POST", path: "/api/v1/uploads" },
    {
      type: "lead",
      text: "Store attachments and get an address back. multipart/form-data. The answer holds the path the agent hands to analyze_image — the file itself never travels through the conversation.",
    },
    {
      type: "paragraph",
      text: "Only what the vision model can actually look at is accepted: image/png, image/jpeg, image/webp, image/gif. Anything else is rejected with 422 rather than stored and silently ignored later. Text files do not belong here at all — they go into the prompt directly.",
    },
    { type: "heading", id: "parameter", title: "Form fields" },
    {
      type: "params",
      rows: [
        {
          name: "files",
          type: "file[] · multipart",
          required: true,
          text: "One or more images, at most UPLOADS_MAX_FILES per request.",
        },
      ],
    },
    { type: "heading", id: "beispiel", title: "Example request" },
    {
      type: "code",
      language: "bash",
      code: `curl -X POST http://localhost:8000/api/v1/uploads \\
  -F "files=@console.png"`,
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "files": [
    {
      "id": "a904577a208845c98dbce47c1d4655f5",
      "filename": "console.png",
      "media_type": "image/png",
      "bytes": 245113,
      "path": "/srv/smeeware/data/uploads/a904577a208845c98dbce47c1d4655f5.png"
    }
  ]
}`,
    },
    {
      type: "paragraph",
      text: "The filename you sent is kept for display only. On disk the file lives under a generated id with an extension derived from the media type — so neither a .. nor a .py finds its way through.",
    },
    {
      type: "responses",
      rows: [
        { status: "201", text: "Stored." },
        {
          status: "422",
          text: "Unsupported type, empty file, too large, or too many files.",
        },
        {
          status: "500",
          text: "Uploads are disabled (UPLOADS_ENABLED=false).",
        },
      ],
    },
  ],

  "endpoints/upload": [
    { type: "endpoint", method: "GET", path: "/api/v1/uploads/{file_id}" },
    {
      type: "lead",
      text: "Fetch one stored attachment. This is what the preview in the conversation hangs on — a reopened chat shows its images the same way the one they were attached in does.",
    },
    { type: "heading", id: "parameter", title: "Path parameter" },
    {
      type: "params",
      rows: [
        {
          name: "file_id",
          type: "string · 32 hex",
          required: true,
          text: "The id from the upload response. Anything else is 422 — the id is generated, not named by a user.",
        },
      ],
    },
    { type: "heading", id: "beispiel", title: "Example request" },
    {
      type: "code",
      language: "bash",
      code: `curl -O http://localhost:8000/api/v1/uploads/a904577a208845c98dbce47c1d4655f5`,
    },
    {
      type: "paragraph",
      text: "The response is the file itself, with the media type it was stored under.",
    },
    {
      type: "responses",
      rows: [
        { status: "200", text: "The file." },
        { status: "404", text: "No attachment under that id." },
        { status: "422", text: "Malformed id." },
      ],
    },
  ],

  "endpoints/transcribe": [
    { type: "endpoint", method: "POST", path: "/api/v1/transcribe" },
    {
      type: "lead",
      text: "Turns a recording into text. Multipart in, JSON out. The language is detected — you never have to pick one first, and a sentence that switches mid-way still comes back whole.",
    },
    { type: "heading", id: "body", title: "Form fields" },
    {
      type: "params",
      rows: [
        {
          name: "file",
          type: "file",
          required: true,
          text: "The recording. webm/opus, mp4, ogg, mp3, wav and flac all work — send what the browser recorded, no conversion needed. Up to 25 MB.",
        },
        {
          name: "model",
          type: "string",
          text: "An id from GET /transcribe/models. Left out, the server uses TRANSCRIBE_MODEL. This is also what decides whether the recording leaves the machine: whisper-local keeps it here, everything else goes to OpenAI.",
        },
        {
          name: "language",
          type: "string",
          text: "ISO code such as de or en. Normally unnecessary — the model detects it. Set it only when you already know, to skip the detection step.",
        },
      ],
    },
    { type: "heading", id: "beispiel", title: "Example" },
    {
      type: "code",
      language: "bash",
      code: `curl -X POST http://localhost:8000/api/v1/transcribe \\
  -F "file=@recording.webm" \\
  -F "model=gpt-transcribe"`,
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "text": "Hallo, das ist ein Test der Transkription.",
  "language": "de",
  "duration_ms": 3200,
  "model": "gpt-transcribe"
}`,
    },
    {
      type: "params",
      rows: [
        {
          name: "text",
          type: "string",
          text: "The transcript as one flowing string.",
        },
        {
          name: "language",
          type: "string | null",
          text: "What the model heard, not what you asked for. null when the model does not report it — whisper-1 in plain JSON, for instance.",
        },
        {
          name: "duration_ms",
          type: "integer",
          text: "Length of the recording in milliseconds, where the model reports it.",
        },
        {
          name: "model",
          type: "string",
          text: "Which entry actually did the work.",
        },
      ],
    },
    { type: "heading", id: "status", title: "Availability" },
    {
      type: "paragraph",
      text: "GET /api/v1/transcribe answers whether it can work at all, without sending a recording: { available, reason, model }. Pass ?model= to ask about a specific one — the answer differs, since whisper-local needs two programs installed and the hosted ones need a key. The frontend asks once on load and hides the microphone when the answer is no, rather than showing a button that is certain to fail.",
    },
    {
      type: "responses",
      rows: [
        { status: "200", text: "Transcribed successfully." },
        {
          status: "422",
          text: "The recording was empty, too large, or could not be decoded.",
        },
        {
          status: "503",
          text: "Transcription is disabled (TRANSCRIBE_ENABLED=false).",
        },
      ],
    },
  ],

  "endpoints/transcribe-models": [
    { type: "endpoint", method: "GET", path: "/api/v1/transcribe/models" },
    {
      type: "lead",
      text: "The transcription models you can send as model. Filtered to what can actually run: no OPENAI_API_KEY and the hosted group disappears, no whisper.cpp on the machine and the local one does. No parameters.",
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "count": 5,
  "default": "gpt-transcribe",
  "groups": ["OpenAI", "Local"],
  "models": [
    {
      "id": "gpt-transcribe",
      "name": "GPT-Transcribe",
      "description": "Most accurate, and reports the language it heard.",
      "group": "OpenAI",
      "runtime": "openai"
    },
    {
      "id": "whisper-local",
      "name": "Whisper (local)",
      "description": "Runs through whisper.cpp — the recording never leaves this machine.",
      "group": "Local",
      "runtime": "local"
    }
  ]
}`,
    },
    {
      type: "params",
      rows: [
        {
          name: "default",
          type: "string",
          text: "What /transcribe uses when no model is given.",
        },
        {
          name: "groups",
          type: "string[]",
          text: "The headings, in the order the settings should show them.",
        },
        {
          name: "models[].runtime",
          type: "string",
          text: "openai or local. This is the field worth reading: local means the recording stays on this machine.",
        },
      ],
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "List retrieved successfully." }],
    },
  ],

  "endpoints/tts": [
    { type: "endpoint", method: "GET", path: "/api/v1/tts" },
    {
      type: "lead",
      text: "Whether read-aloud works, and which voice it uses. Speech itself is not a call you make — the read_aloud tool does it inside a chat. This only tells the UI what to offer.",
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "available": true,
  "provider": "elevenlabs",
  "voice_id": "DDpANZ8PLYsm2RvgHVlV",
  "reason": null
}`,
    },
    {
      type: "paragraph",
      text: 'With an ELEVENLABS_API_KEY, provider is "elevenlabs" and voice_id is the default voice. Without one, provider is "free" — read-aloud still works through a keyless fallback voice, and reason says so. available is only false when TTS_ENABLED=false.',
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "Status retrieved." }],
    },
  ],

  "endpoints/tts-models": [
    { type: "endpoint", method: "GET", path: "/api/v1/tts/models" },
    {
      type: "lead",
      text: "The speech models the read_aloud tool can use. Filtered to what can run: no ELEVENLABS_API_KEY and only the free fallback remains, with the default shifting to it. No parameters.",
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "count": 5,
  "default": "eleven_multilingual_v2",
  "default_voice": "DDpANZ8PLYsm2RvgHVlV",
  "groups": ["ElevenLabs", "Free"],
  "models": [
    {
      "id": "eleven_multilingual_v2",
      "name": "Eleven Multilingual v2",
      "description": "The default — natural in many languages, understands IPA.",
      "group": "ElevenLabs",
      "runtime": "elevenlabs"
    },
    {
      "id": "free-google",
      "name": "Free voice",
      "description": "No key needed — a plain fallback voice.",
      "group": "Free",
      "runtime": "free"
    }
  ]
}`,
    },
    {
      type: "params",
      rows: [
        {
          name: "default",
          type: "string",
          text: "The model read_aloud uses when the request names none.",
        },
        {
          name: "default_voice",
          type: "string",
          text: "The ElevenLabs voice used when the request sets no voice_id.",
        },
        {
          name: "models[].runtime",
          type: "string",
          text: "elevenlabs or free — whether a key stands behind it.",
        },
      ],
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "List retrieved successfully." }],
    },
  ],

  "endpoints/prompts": [
    { type: "endpoint", method: "GET", path: "/api/v1/prompts" },
    {
      type: "lead",
      text: "Lists the available system prompts with title, variables, and length. No parameters.",
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "count": 2,
  "default": "default",
  "prompts": [
    { "name": "default", "title": "Default assistant", "variables": ["skills_block"], "length": 4820 },
    { "name": "knapp", "title": "Short answers", "variables": [], "length": 640 }
  ]
}`,
    },
    {
      type: "responses",
      rows: [{ status: "200", text: "List retrieved successfully." }],
    },
  ],

  "endpoints/prompt": [
    { type: "endpoint", method: "GET", path: "/api/v1/prompts/{name}" },
    {
      type: "lead",
      text: "Returns a single system prompt verbatim, along with its metadata.",
    },
    { type: "heading", id: "parameter", title: "Path parameters" },
    {
      type: "params",
      rows: [
        {
          name: "name",
          type: "string",
          required: true,
          text: "Name of the prompt, e.g. default.",
        },
      ],
    },
    { type: "heading", id: "beispiel", title: "Example" },
    {
      type: "code",
      language: "bash",
      code: `curl http://localhost:8000/api/v1/prompts/default`,
    },
    { type: "heading", id: "antwort", title: "Response" },
    {
      type: "code",
      language: "json",
      code: `{
  "name": "default",
  "title": "Default assistant",
  "variables": ["skills_block"],
  "length": 4820,
  "text": "You are Smeeware, an assistant …\\n\\n## Reading pages\\n…"
}`,
    },
    {
      type: "responses",
      rows: [
        { status: "200", text: "Prompt found." },
        { status: "404", text: "Unknown name." },
      ],
    },
  ],

  sdks: [
    {
      type: "lead",
      text: "Officially maintained clients with types, retries, and streaming support out of the box.",
    },
    { type: "heading", id: "verfuegbar", title: "Available SDKs" },
    {
      type: "params",
      rows: [
        { name: "@smeeware/sdk", type: "TypeScript", text: PLACEHOLDER_SHORT },
        { name: "smeeware", type: "Python", text: PLACEHOLDER_SHORT },
        { name: "smeeware-go", type: "Go", text: PLACEHOLDER_SHORT },
      ],
    },
    { type: "heading", id: "beitragen", title: "Contributing" },
    { type: "paragraph", text: PLACEHOLDER },
  ],

  changelog: [
    {
      type: "lead",
      text: "Every change to the API, newest first.",
    },
    { type: "heading", id: "v0-3-0", title: "0.3.0 — placeholder" },
    { type: "paragraph", text: PLACEHOLDER },
    { type: "heading", id: "v0-2-0", title: "0.2.0 — placeholder" },
    { type: "paragraph", text: PLACEHOLDER_SHORT },
    { type: "heading", id: "v0-1-0", title: "0.1.0 — placeholder" },
    { type: "paragraph", text: PLACEHOLDER_SHORT },
  ],
};

export const tocForSlug = (slug: string) =>
  (docsContent[slug] ?? [])
    .filter(
      (block): block is Extract<DocBlock, { type: "heading" }> =>
        block.type === "heading",
    )
    .map(({ id, title }) => ({ id, title }));
