// Minimale service worker voor de app-shell. Verhoog de versie bij elke wijziging.
// v2: v1 kon een / bevatten met server-gerenderde dashboarddata; activate ruimt die op.
const CACHE_NAME = "conversion-engine-shell-v2";

const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("conversion-engine-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Alleen GET-verzoeken op dezelfde origin; API-calls en externe URLs gaan ongemoeid naar het netwerk.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Interne API-routes bevatten dashboarddata en worden nooit gecachet.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigatie: network-first, met de gecachte / als offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (url.pathname === "/" && response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Gehashte Next.js-assets en de shellbestanden: cache-first.
  const isNextStatic = url.pathname.startsWith("/_next/static/");
  if (isNextStatic || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (isNextStatic && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
