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
| `list_files` | Attached originals and this conversation's working files |
| `read_file` | Paged text/source reading; text extraction from PDF, DOCX, PPTX and XLSX |
| `copy_file` | Copy original or working-file bytes into a working copy |
| `write_file` | Write edited text in the conversation's working directory |
| `edit_file` | Replace an exact UTF-8 text fragment in a working copy; unique match by default |
| `extract_archive` | Unpack a ZIP into that working directory |
| `export_file` | Download a working file or a directory packaged as a ZIP |
| `storage_put` / `storage_list` / `storage_get` / `storage_delete` | Object storage (mc/S3) |
| `get_context` / `get_weather` | Location, timezone, date / forecast |
| `read_aloud` | Speak an answer out loud (ElevenLabs, or a free English-only voice) |
| `skill_list` / `use_skill` / `skill_save` / `skill_import` / `skill_delete` | Skills |
| `run_shell` | Shell command (`SHELL_ENABLED`) |

### File attachments

`POST /api/v1/uploads` stores complete originals of any type, including ZIP,
text, documents and images. Add the returned IDs to the user message's
`attachment_ids`, send a `chat_id` and keep `tools=true` for file processing.
Uploads and attachment processing require an active `X-Session-Id`; the
frontend forwards its session automatically.

The built-in file tools work on attached originals and a directory scoped to
that conversation. Originals stay unchanged. `copy_file` creates a working
copy with the exact original bytes; `edit_file` changes an exact text fragment
without recreating a large file. Replacements require a unique match unless
`replace_all=true`. The agent can also unpack ZIPs there and use `export_file`
to return a downloadable file or ZIP.
PDF text extraction uses `pypdf`; the other supported document readers use
Python's standard library. An unrecognized binary format can still be uploaded
and downloaded, but needs a suitable parser to read or edit its contents.

`GET /api/v1/uploads/{id}` serves originals and exports with a download
filename. It requires a session, except for files referenced by a currently
shared chat. Unsharing removes public access. Older inline-text chat
attachments remain compatible.

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
| Shell | `SHELL_ENABLED` (`false`), `ROOT` (`false`), `SHELL_TIMEOUT` (`30`), `SHELL_WORKDIR`, `SHELL_MAX_OUTPUT` (`8000`) |
| Web tools | `BRAVE_ANSWERS_ENABLED` (`true`), `HACKERONE_ALLOW_SUBMIT` (`false`, drafts only), `TOOL_HTTP_TIMEOUT` (`20`), `SCRAPE_MAX_CHARS` (`12000`), `SCRAPE_CONCURRENCY` (`4`) |
| Data | `CHATS_DB_PATH` (`data/chats.db`), `SKILLS_ENABLED` (`true`) |
| Attachments | `UPLOADS_ENABLED` (`true`), `UPLOADS_DIR` (`data/uploads`), `UPLOADS_MAX_BYTES` (`20000000` per original/export), `UPLOADS_MAX_FILES` (`8` per upload/message), `UPLOADS_MAX_EXTRACTED_BYTES` (`100000000`), `UPLOADS_MAX_ARCHIVE_MEMBERS` (`1000`) |
| Prompts & MCP | `PROMPTS_DIR` (`prompts`), `DEFAULT_PROMPT` (`default`), `MCP_ENABLED` (`true`), `MCP_CONFIG` (`mcp.json`), `MCP_MAX_TOOL_ROUNDS` (`8`) |

Any `*_TIMEOUT` set to `0` means no time limit.

Use `GET /api/v1/capabilities` for the active `uploads`, `uploads_max_bytes` and
`uploads_max_files` values used by the composer. Oversized files return HTTP
413 with `file_too_large` and `{ max_bytes, filename }` details; the UI shows
the message in its selected language.

See [`../DEPLOY.md`](../DEPLOY.md) for production notes (single worker, host
network, TLS).

### Shell privilege commands

`ROOT=false` blocks `sudo` and `su` in `run_shell`. To allow those commands,
set these values manually in `backend/.env`:

```dotenv
SHELL_ENABLED=true
ROOT=true
```

Restart the backend and enable the Shell plugin in the chat. `ROOT` removes
only that command guard: the backend keeps its existing OS user, other command
guards and file-tool scopes. Noninteractive commands such as `sudo -n whoami`
still require the host's sudo permissions; the flag supplies no password or
additional OS privileges.

## Developer checks

With the backend virtual environment activated, run the test suite from this
directory:

```bash
python -m unittest discover -s tests
```

The frontend's attachment and chat payload tests run with `npm test` from
`../frontend`.
