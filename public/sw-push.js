/* Moto Mandados Service Worker — Urgent Push & Background Notifications */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function buildNotificationOptions(payload) {
  const title = payload && payload.title ? String(payload.title) : 'Entrega Urgente · Moto Mandados';
  const body =
    payload && payload.body
      ? String(payload.body)
      : 'Nueva solicitud urgente disponible para tu motocicleta.';
  const tag = payload && payload.tag ? String(payload.tag) : `motomandados-urgent-${Date.now()}`;
  const deliveryId = payload && payload.deliveryId ? String(payload.deliveryId) : '';
  const url = payload && payload.url ? String(payload.url) : '/';
  const isUrgent = payload && payload.isUrgent !== false;

  return {
    title,
    options: {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag,
      renotify: true,
      requireInteraction: isUrgent,
      vibrate: isUrgent ? [240, 100, 240, 100, 320] : [150, 80, 150],
      data: {
        url,
        deliveryId,
        isUrgent,
      },
      actions: [
        {
          action: 'open_delivery',
          title: 'Ver Entrega',
        },
        {
          action: 'dismiss',
          title: 'Cerrar',
        },
      ],
    },
  };
}

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        payload = { body: event.data.text() };
      } catch {
        payload = {};
      }
    }
  }

  const { title, options } = buildNotificationOptions(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SHOW_URGENT_NOTIFICATION') {
    const { title, options } = buildNotificationOptions(data.payload || {});
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/';
  const deliveryId =
    (event.notification.data && event.notification.data.deliveryId) || '';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              deliveryId,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
