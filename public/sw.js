const CACHE_NAME = 'jazz-fretboard-v4';
const SOUNDFONT_CACHE_NAME = 'jazz-fretboard-soundfonts-v1';

const PRECACHE_LOCAL_URLS = [
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
  './favicon.ico'
];

const EXTERNAL_APP_URLS = [
  'https://cdn.tailwindcss.com'
];

const SOUNDFONT_CDN_BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/';
const SOUNDFONT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOUNDFONT_INSTRUMENTS = [
  { folder: 'electric_guitar_jazz-mp3', midis: [45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81] },
  { folder: 'electric_guitar_clean-mp3', midis: [45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81] },
  { folder: 'acoustic_bass-mp3', midis: [36, 39, 42, 45, 48, 51, 54] },
  { folder: 'drawbar_organ-mp3', midis: [48, 51, 54, 57, 60, 63, 66, 69] },
  { folder: 'electric_piano_1-mp3', midis: [48, 51, 54, 57, 60, 63, 66, 69] },
  { folder: 'acoustic_guitar_steel-mp3', midis: [48, 51, 54, 57, 60, 63, 66, 69] }
];

const ALL_SOUNDFONT_URLS = SOUNDFONT_INSTRUMENTS.flatMap((inst) =>
  inst.midis.map((midi) => {
    const octave = Math.floor(midi / 12) - 1;
    const note = SOUNDFONT_NOTE_NAMES[midi % 12] + octave;
    return `${SOUNDFONT_CDN_BASE}${inst.folder}/${note}.mp3`;
  })
);

async function cacheUrlSafely(cache, url, opts = {}) {
  try {
    const existing = await cache.match(url, { ignoreSearch: true });
    if (existing) return true;
    const res = await fetch(url, opts);
    if (res && (res.status === 200 || res.type === 'opaque')) {
      await cache.put(url, res.clone());
      return true;
    }
  } catch (err) {
    // Spróbuj trybu no-cors dla zewnętrznych skryptów (np. Tailwind CDN)
    if (opts.fallbackNoCors) {
      try {
        const opaqueRes = await fetch(url, { mode: 'no-cors' });
        if (opaqueRes) {
          await cache.put(url, opaqueRes.clone());
          return true;
        }
      } catch (e) {
        return false;
      }
    }
  }
  return false;
}

async function precacheInBatches(cache, urls, batchSize = 8, opts = {}) {
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((url) => cacheUrlSafely(cache, url, opts)));
  }
}

// Instalacja: pobranie WSZYSTKICH zasobów aplikacji, stylów i wszystkich 6 instrumentów studyjnych do pełnej pracy offline
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const appCache = await caches.open(CACHE_NAME);
      await precacheInBatches(appCache, PRECACHE_LOCAL_URLS, 6);
      await precacheInBatches(appCache, EXTERNAL_APP_URLS, 2, { fallbackNoCors: true });

      const sfCache = await caches.open(SOUNDFONT_CACHE_NAME);
      await precacheInBatches(sfCache, ALL_SOUNDFONT_URLS, 8, { mode: 'cors' });
    })()
  );
});

// Aktywacja i czyszczenie starych wersji cache (z zachowaniem pobranych próbek SoundFont)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== SOUNDFONT_CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Przechwytywanie żądań - 100% działania w trybie Offline (również w trybie samolotowym)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 0. Studyjne próbki MP3 (SoundFonty) - czysty Cache-First (niezmienne pliki audio, 100% offline)
  if (url.hostname === 'gleitz.github.io' && url.pathname.endsWith('.mp3')) {
    event.respondWith(
      caches.open(SOUNDFONT_CACHE_NAME).then((cache) =>
        cache.match(req, { ignoreSearch: true }).then((cachedRes) => {
          if (cachedRes) return cachedRes;
          return fetch(req, { mode: 'cors' }).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          });
        })
      )
    );
    return;
  }

  // 1. Zewnętrzny Tailwind CDN - Cache-First z obsługą odpowiedzi opaque
  if (url.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req, { ignoreSearch: true }).then((cachedRes) => {
          if (cachedRes) {
            fetch(req).then((networkRes) => {
              if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
                cache.put(req, networkRes.clone());
              }
            }).catch(() => {});
            return cachedRes;
          }
          return fetch(req).then((networkRes) => {
            if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          });
        })
      )
    );
    return;
  }

  // 2. Nawigacja HTML - Network First z natychmiastowym fallbackiem do Cache
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

  // 3. Pozostałe zasoby lokalne (jazz_standards.js, ikony, manifest) - Stale-While-Revalidate / Cache First
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        fetch(req).then((networkRes) => {
          if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes.clone()));
          }
        }).catch(() => {/* cichy błąd offline */});
        return cachedRes;
      }

      return fetch(req).then((networkRes) => {
        if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
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
