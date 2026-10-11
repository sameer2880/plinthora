const CACHE_NAME = "plinthora-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.png", "/logo.png"];

// Never kept in the offline cache: data calls and sign-in / reset links (they carry tokens).
const SKIP_PREFIXES = ["/_serverFn", "/api", "/mcp", "/auth/", "/receipt/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  if (["script", "style", "worker"].includes(event.request.destination)) return;
  const { pathname } = new URL(event.request.url);
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
  const request =
    event.request.destination === "document"
      ? new Request(event.request, { cache: "no-store" })
      : event.request;
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only keep complete, successful answers (a partial 206 or an error page breaks cache.put).
        if (response.ok && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
  );
});

// ---------------------------------------------------------------------------------------------
// Push notifications (sent by the send-push Edge Function through Firebase Cloud Messaging)
// ---------------------------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        try {
          payload = { notification: { body: event.data.text() } };
        } catch {
          payload = {};
        }
      }
      const n = payload.notification || {};
      const d = payload.data || {};
      const title = n.title || d.title || "Plinthora";
      const body = n.body || d.body || "";

      // If Plinthora is open and on screen, the bell inside the app already shows it.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === "visible")) return;

      await self.registration.showNotification(title, {
        body,
        icon: "/logo.png",
        badge: "/favicon.png",
        tag: d.activity_id || undefined,
        data: { url: d.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if ("focus" in w) return w.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});