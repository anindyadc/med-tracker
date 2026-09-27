const CACHE_NAME = 'medtracker-v6';

const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/pages/login.css',
  './css/pages/dashboard.css',
  './css/pages/medications.css',
  './css/pages/inventory.css',
  './css/pages/history.css',
  './css/pages/settings.css',
  './js/firebase-config.js',
  './js/auth.js',
  './js/router.js',
  './js/db.js',
  './js/scheduler.js',
  './js/inventory.js',
  './js/notifications.js',
  './js/date-utils.js',
  './js/tilt.js',
  './js/ui/dashboard.js',
  './js/ui/medications.js',
  './js/ui/inventory-view.js',
  './js/ui/history.js',
  './js/ui/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Never intercept Firebase/Google API calls - always go to network for live data.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Lets page code trigger a local notification with action buttons via the SW,
// which is required for notification actions to work (plain `new Notification()` can't have actions).
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  if (type === 'SHOW_DUE_NOTIFICATION') {
    const { title, body, tag, medicationId, scheduledDate, scheduledTime } = payload;
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: { medicationId, scheduledDate, scheduledTime },
        actions: [
          { action: 'mark-taken', title: 'Mark Taken' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const data = event.notification.data || {};
      const targetUrl = new URL('./app.html#dashboard', self.location.href).href;
      for (const client of clients) {
        if (client.url.includes('app.html')) {
          client.postMessage({ type: 'NOTIFICATION_ACTION', action: event.action, data });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
