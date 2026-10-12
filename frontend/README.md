# SMEEware Chat — Frontend

The web client: the chat app, the documentation and the landing page. Built with
**Next.js 16** (App Router), **React 19**, **Tailwind v4**, TanStack Query and
zustand.

<p align="center">
  <img src="../assets/showcase.png" alt="SMEEware Chat on desktop and iPhone" width="100%" />
</p>

> From the repo root, [`../install.sh`](../install.sh) sets everything up and
> [`../start.sh`](../start.sh) runs this together with the backend. The steps
> below are for running the frontend on its own.

## Run

```bash
npm ci
npm run dev        # http://localhost:3000
```

For production:

```bash
npm run build
npm run start      # serves the built app on :3000
```

The frontend proxies to the backend server-side. By default it targets
`http://127.0.0.1:8000/api/v1`; override it with `LLM_STREAM_URL` (the other
endpoints are derived from it). The browser never talks to the backend directly.

## What lives where

```
app/                 Routes: / (landing), /chat, /docs, /login, /settings, /api/*
components/
  chat/              The chat UI (composer, sidebar, voice call, tour, modals, …)
  docs/              Docs rendering, sidebar, search, blocks
  site/              Header, footer, hero, account menu
  ui/                Design-system primitives
context/             Providers (theme, query, i18n)
lib/
  chat/              Turn runner, commands, streaming, attachments
  docs/              Docs content + navigation (bilingual)
  i18n/              Message catalogs (en/de) and locale resolution
  settings/          Persisted user settings (zustand)
proxy.ts             Auth gate for /chat (Next.js proxy)
```

## Internationalization

The UI and docs are available in **English and German**. Messages live in
`lib/i18n/messages/{en,de}.ts`; the active locale comes from a cookie
(auto-detected from `Accept-Language` on first visit) and is switchable in
**Settings → Appearance**. Docs content is translated through
`lib/docs/de.ts`.
