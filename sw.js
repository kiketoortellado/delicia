/**
 * sw.js — Service Worker
 * Network-first para JS (siempre frescos), cache-first para CSS/fuentes
 */

const CACHE_NAME = 'delicias-v4';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase y gstatic: siempre network
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebasestorage.app') ||
      url.hostname.includes('gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // JS local: siempre network-first (nunca cachear JS)
  if (url.origin === self.location.origin && url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // CSS y fuentes: cache-first
  if (url.pathname.endsWith('.css') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Todo lo demás: network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
