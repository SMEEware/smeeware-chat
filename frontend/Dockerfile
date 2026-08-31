# syntax=docker/dockerfile:1

# ---- Abhaengigkeiten (inkl. dev, fuer den Build) ----------------------------
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ------------------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Keine Geheimnisse noetig: LLM_STREAM_URL & Co. liest das Frontend erst zur
# Laufzeit (Server-Routen), nicht beim Build.
RUN npm run build

# ---- Runtime ----------------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Ganzes node_modules aus dem Build uebernehmen (nicht nur --omit=dev): dieses
# Next ist angepasst und laedt beim Start seine .ts-Config -- mit dem vollen
# Baum gibt es dabei keine Ueberraschung. Groesse ist auf einem eigenen Server
# das kleinere Uebel gegenueber einem Start, der an einer fehlenden Datei haengt.
COPY --from=build /app/package.json  ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/.next          ./.next
COPY --from=build /app/public         ./public
COPY --from=build /app/node_modules   ./node_modules

RUN useradd -r -u 10001 -m app && chown -R app:app /app
USER app

EXPOSE 3000
# `next start` bedient die gebaute App; der serverseitige Proxy reicht die
# API-Aufrufe ans Backend weiter (LLM_STREAM_URL).
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
