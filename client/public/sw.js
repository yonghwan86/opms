const CACHE_NAME = "yuga-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = { title: "유가모니터링", body: "새 알림이 있습니다.", icon: "/icon-192.png", url: "/", badgeCount: 1 };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  const showAndBadge = async () => {
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
      vibrate: [200, 100, 200],
    });
    if (navigator.setAppBadge) {
      await navigator.setAppBadge(payload.badgeCount ?? 1);
    }
  };

  event.waitUntil(showAndBadge());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  const openAndClear = async () => {
    if (navigator.clearAppBadge) {
      await navigator.clearAppBadge();
    }
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.includes(self.location.origin) && "focus" in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(url);
    }
  };

  event.waitUntil(openAndClear());
});
