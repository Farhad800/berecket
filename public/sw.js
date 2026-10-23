// Bereket FMS service worker.
// SECURITY: this app shows live, per-user factory data. Pages and API/server-action
// responses are NEVER cached — only static build assets, icons and the offline page.
const CACHE = "bereket-fms-v2";
const PRECACHE = ["/offline", "/brand/bereket-logo.jpg", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname.startsWith("/brand/");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Pages: always network. If offline, show the offline page (never a cached data page).
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }

  // Immutable static assets: cache-first.
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Everything else (data, RSC payloads, attachments) goes straight to the network.
});

// ───────── Push notifications (arrive even when the app is closed)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data ? e.data.text() : "Bereket FMS" }; }
  const title = d.title || "Bereket FMS";
  const tasks = [
    self.registration.showNotification(title, {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: d.tag || undefined,
      data: { url: d.url || "/notifications" },
      renotify: !!d.tag,
      vibrate: [120, 60, 120],
    }),
  ];
  if (typeof d.badge === "number" && self.navigator && "setAppBadge" in self.navigator) tasks.push(self.navigator.setAppBadge(d.badge).catch(() => {}));
  // Tell open windows so the bell count refreshes without reloading.
  tasks.push(self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "push" }))));
  e.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/notifications", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const same = cs.find((c) => new URL(c.url).origin === self.location.origin);
      if (same) return same.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : null)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});

// The browser renewed the subscription: save the new one.
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "resubscribe" }))));
});
