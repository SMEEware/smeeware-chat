const VERSION = "v1";
const SHELL_CACHE = `smeeware-shell-${VERSION}`;
const ASSET_CACHE = `smeeware-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const SHELL_ASSETS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((schluessel) =>
        Promise.all(
          schluessel
            .filter((name) => name !== SHELL_CACHE && name !== ASSET_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function istStatischesAsset(pfad) {
  return (
    pfad.startsWith("/_next/static/") ||
    pfad.startsWith("/icons/") ||
    pfad.startsWith("/assets/img/") ||
    pfad === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (request.headers.has("range")) return;

  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.get("accept")?.includes("text/event-stream")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const treffer = await caches.match(OFFLINE_URL);
        return (
          treffer ??
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
    return;
  }

  if (!istStatischesAsset(url.pathname)) return;

  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const zwischengespeichert = await cache.match(request);
      if (zwischengespeichert) return zwischengespeichert;

      const antwort = await fetch(request);
      if (antwort.ok && antwort.type === "basic") {
        cache.put(request, antwort.clone());
      }
      return antwort;
    }),
  );
});
