// ════════════════════════════════════════════════════════════
// SERVICE WORKER — Restaurante Delicias
// Estrategia: Cache First para assets estáticos,
//             Network First para Firebase (siempre fresco)
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'delicias-v2';
const CACHE_STATIC = 'delicias-static-v2';

// Assets que se cachean al instalar
const STATIC_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      // Intentar cachear cada asset individualmente para no fallar todo si uno falla
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(e => console.warn('Cache miss:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase Realtime DB / Auth → siempre red, sin cache
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(fetch(event.request).catch(() => {
      // Si falla Firebase offline, devolver respuesta vacía para no romper la UI
      return new Response(JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Para peticiones GET de navegación (HTML, CSS, JS) → Cache First con fallback a red
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // Actualizar cache en background (stale-while-revalidate)
          fetch(event.request).then(fresh => {
            if (fresh && fresh.status === 200) {
              caches.open(CACHE_STATIC).then(cache => cache.put(event.request, fresh));
            }
          }).catch(() => {});
          return cached;
        }
        // No está en cache → buscar en red y cachear
        return fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const toCache = response.clone();
            caches.open(CACHE_STATIC).then(cache => cache.put(event.request, toCache));
          }
          return response;
        }).catch(() => {
          // Si es navegación y sin red, servir admin.html desde cache
          if (event.request.mode === 'navigate') {
            return caches.match('./admin.html') || caches.match('./index.html');
          }
        });
      })
    );
    return;
  }
});

// ── BACKGROUND SYNC (futuro) ──────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pedidos') {
    // Reservado para sincronización diferida de pedidos offline
    console.log('[SW] Background sync: sync-pedidos');
  }
});

// ── PUSH NOTIFICATIONS (futuro) ──────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'Delicias', {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'delicias-notif',
  });
});
