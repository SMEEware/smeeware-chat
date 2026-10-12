# SMEEware Backend

FastAPI service behind the chat frontend. The LLM sits behind a provider
interface, so DeepSeek, OpenAI and Ollama are interchangeable.

## Run

From the repo root, `./install.sh` creates `.env`, the venv and installs
everything. By hand:

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set at least DEEPSEEK_API_KEY
python run.py               # http://127.0.0.1:8000
```

In development, `GET /docs` (Swagger UI) and `GET /openapi.json` are available;
they are turned off in production.

## Layers

```
run.py                     Entrypoint (uvicorn)
src/app.py                 App factory: lifecycle, CORS, error handlers, routes
│
├─ api/                    HTTP -- knows services only through dependencies
│  ├─ deps.py              Request -> ServiceProvider -> Service
│  └─ v1/routes/           health, chat, chats, models, vision, uploads, …
│
├─ schemas/                Pydantic models of the API (the stable outside contract)
│
├─ core/
│  ├─ config.py            Settings, read once from .env
│  ├─ container.py         ServiceProvider: builds services, holds them, cleans up
│  ├─ exceptions.py        Domain errors -> HTTP status
│  └─ logging.py
│
├─ services/ai/            Domain logic -- knows nothing about HTTP
│  ├─ base.py              LLMProvider, Message, Completion, StreamChunk
│  ├─ agent.py             Agent: system prompt, options, history, tool rounds
│  └─ providers/
│     ├─ openai_compatible.py   all SDK logic, once
│     └─ deepseek.py            just base_url + name
│
├─ services/skills/        SkillLibrary: local + bucket skills, frontmatter
└─ services/tools/         Tools -- one ToolBox interface for all
   ├─ composite.py         merges local and MCP tools into one collection
   ├─ mcp_toolbox.py       servers from mcp.json
   └─ local/               in-process: context, weather, search, shell,
                           storage.py (mc/S3) and web/ (scraper)
```

Dependencies always point inward: `api` -> `services` -> `core`. No service
imports FastAPI, no route builds its own client.

## Tools

The agent sees a flat list; `CompositeToolBox` decides where a tool comes from.
If a requirement is missing (no API key, `SHELL_ENABLED=false`, no `mc` alias),
the tool is quietly left out — the model only sees what actually works.

| Tool | For |
| --- | --- |
| `fetch_page` | Page as Markdown; `offset` reads on |
| `extract_selectors` | CSS selectors; `'a.item @href'` pulls an attribute |
| `extract_tables` | `<table>` as a Markdown table, one at a time via `index` |
| `list_links` | Links with anchor text, filterable via `pattern` and `scope` |
| `fetch_json` | APIs — structure first, then data; `path` reaches in |
| `batch_fetch` | Several pages in parallel, throttled |
| `web_search` / `image_search` | Brave (needs `BRAVE_API_KEY`) |
| `brave_answers` | One sourced AI answer in a single call (`BRAVE_ANSWERS_API_KEY`) |
| `google_search` / `maps_search` / `amazon_search` | SerpAPI (`SERPAPI_API_KEY`) |
| `social_profile` / `youtube_search` / `youtube_transcript` | SerpAPI engines |
| `analyze_image` | Look at an image and answer a question (vision model) |
| `generate_image` | Create an image from a description (OpenAI Images) |
| `storage_put` / `storage_list` / `storage_get` / `storage_delete` | Object storage (mc/S3) |
| `get_context` / `get_weather` | Location, timezone, date / forecast |
| `read_aloud` | Speak an answer out loud (ElevenLabs, or a free English-only voice) |
| `skill_list` / `use_skill` / `skill_save` / `skill_import` / `skill_delete` | Skills |
| `run_shell` | Shell command (`SHELL_ENABLED`) |

### Skills

A skill is a folder with a `SKILL.md` (YAML frontmatter `name`, `description`,
`enabled` + instructions) — the format adopted from Anthropic, so third-party
skills fit in as-is. `services/skills/library.py` unifies two layers: trusted
skills from the repo (`skills/`, in git) and model-maintained ones under
`data/skills`.

## Configuration

`.env.example` holds only what you are likely to change; the
[API key table](../README.md#api-keys) explains what each key unlocks. Missing
keys switch their feature off at startup: the tool is not registered, its
plugin cannot be installed, and the frontend hides the matching option.

Everything below has a working default. Add a line to `backend/.env` only to
change one.

| Area | Setting (default) |
| --- | --- |
| Server | `ENVIRONMENT` (`development`; `start.sh -build` and Docker use `production`), `DEBUG` (`false`), `HOST` (`127.0.0.1`), `PORT` (`8000`), `CORS_ORIGINS` (`*`), `SESSION_TTL` (`43200` s) |
| Chat model | `DEFAULT_MODEL` (`deepseek-v4-flash`), `DEEPSEEK_BASE_URL`, `LLM_TIMEOUT` (`60`), `LLM_MAX_RETRIES` (`2`) |
| OpenAI | `OPENAI_ENABLED` (`true`), `OPENAI_BASE_URL`, `OPENAI_DEFAULT_MODEL` (`gpt-5.6-terra`), `OPENAI_REASONING_EFFORT` (`medium`), `OPENAI_REASONING_SUMMARY` (`detailed`), `OPENAI_TIMEOUT` (`600`) |
| Images | `IMAGE_ENABLED` (`true`), `IMAGE_MODEL` (`gpt-image-2`), `IMAGE_SIZE` (`1024x1024`), `IMAGE_QUALITY` (`high`), `IMAGE_FORMAT` (`png`, keeps the live preview), `IMAGE_MAX_REFERENCES` (`4`), `IMAGE_ARCHIVE` (`true`, copies to the bucket when storage is on) |
| Vision | `VISION_ENABLED` (`true`), `VISION_MODEL` (`deepseek-v4-flash-vision-exp`), `VISION_API_KEY` / `VISION_BASE_URL` (the DeepSeek ones when empty), `VISION_MAX_IMAGES` (`8`) |
| Voice input | `TRANSCRIBE_ENABLED` (`true`), `TRANSCRIBE_MODEL` (`gpt-transcribe`), `WHISPER_BINARY` (`whisper-cli`), `FFMPEG_BINARY` (`ffmpeg`), `WHISPER_MODEL` (`data/models/ggml-large-v3-turbo.bin`) |
| Read aloud | `TTS_ENABLED` (`true`), `TTS_MODEL` (`eleven_multilingual_v2`), `ELEVENLABS_VOICE_ID`, `TTS_FREE_LANGUAGE` (`en`, the free voice's language), `TTS_MAX_CHARS` (`5000`) |
| Ollama | `OLLAMA_BASE_URL` (`http://localhost:11434/v1`), `OLLAMA_TIMEOUT` (`600`) |
| Storage | `STORAGE_BUCKET` (`llm`), `STORAGE_PREFIX`, `MC_BINARY` (`mc`), `MC_CONFIG_DIR` (`~/.mc`), `STORAGE_LOCAL_ROOT` (limits which local files may be uploaded) |
| Shell | `SHELL_TIMEOUT` (`30`), `SHELL_WORKDIR`, `SHELL_MAX_OUTPUT` (`8000`) |
| Web tools | `BRAVE_ANSWERS_ENABLED` (`true`), `HACKERONE_ALLOW_SUBMIT` (`false`, drafts only), `TOOL_HTTP_TIMEOUT` (`20`), `SCRAPE_MAX_CHARS` (`12000`), `SCRAPE_CONCURRENCY` (`4`) |
| Data | `CHATS_DB_PATH` (`data/chats.db`), `UPLOADS_DIR` (`data/uploads`), `UPLOADS_MAX_BYTES` (`20000000`), `SKILLS_ENABLED` (`true`) |
| Prompts & MCP | `PROMPTS_DIR` (`prompts`), `DEFAULT_PROMPT` (`default`), `MCP_ENABLED` (`true`), `MCP_CONFIG` (`mcp.json`), `MCP_MAX_TOOL_ROUNDS` (`8`) |

Any `*_TIMEOUT` set to `0` means no time limit. See
[`../DEPLOY.md`](../DEPLOY.md) for production notes (single worker, host
network, TLS).
