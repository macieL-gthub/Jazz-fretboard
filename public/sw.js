const CACHE_NAME = 'jazz-fretboard-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './jazz_standards.js',
  './manifest.webmanifest',
  './manifest.json',
  './icon.svg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-512x512.png',
  './apple-touch-icon.png',
  './favicon.ico',
  'https://cdn.tailwindcss.com'
];

// Instalacja i pobranie kluczowych zasobów do pamięci podręcznej
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[ServiceWorker] Błąd precache części zasobów:', err);
      });
    })
  );
});

// Aktywacja i czyszczenie starych wersji cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Przechwytywanie żądań - pełne działanie w trybie Offline na telefonie
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Dla nawigacji HTML - Network First z natychmiastowym fallbackiem do Cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return (await caches.match('./')) || (await caches.match('./index.html'));
        })
    );
    return;
  }

  // 2. Dla skryptów, ikon i bibliotek (w tym bazy jazz_standards.js) - Stale-While-Revalidate / Cache First
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        // Zwróć z pamięci podręcznej i spróbuj odświeżyć w tle
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
          }
        }).catch(() => {/* cichy błąd offline */});
        return cachedRes;
      }

      // Jeśli brak w cache, pobierz z sieci i zapisz
      return fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      }).catch((err) => {
        console.warn('[ServiceWorker] Żądanie offline nieodnalezione w cache:', req.url);
        throw err;
      });
    })
  );
});
