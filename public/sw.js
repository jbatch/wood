self.WOOD_SW_VERSION = "20260527-1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(recordPush(data));
  event.waitUntil(
    self.registration.showNotification(data.title || "Wood", {
      body: data.body || "You got Wood",
      icon: data.icon || "/icon.svg",
      badge: data.badge || "/notifications/wood-badge.png",
      vibrate: data.vibrate,
      actions: data.actions || [],
      tag: data.woodId || `wood-${Date.now()}`,
      renotify: true,
      data: {
        url: data.url || "/",
        styleId: data.styleId || null,
        action: data.actions?.[0]?.action || null,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => client.url === target);
        if (existing) return existing.focus();
        return self.clients.openWindow(target);
      }),
  );
});

async function recordPush(data) {
  const cache = await caches.open("wood-debug");
  const response = await cache.match("/push-events");
  const entries = response ? await response.json() : [];
  entries.unshift({
    at: new Date().toISOString(),
    title: data.title || "Wood",
    body: data.body || "",
    url: data.url || "/",
    icon: data.icon || "",
    badge: data.badge || "",
    styleId: data.styleId || "",
    actions: data.actions || [],
  });
  await cache.put(
    "/push-events",
    new Response(JSON.stringify(entries.slice(0, 25)), {
      headers: { "content-type": "application/json" },
    }),
  );
}
