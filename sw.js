// Marvel Super War Service Worker
const STATIC_CACHE = 'msw-static-v1';
const RUNTIME_CACHE = 'msw-runtime-v1';

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return Promise.allSettled(
                PRECACHE_URLS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[SW] Precache failed:', url, err);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names
                    .filter((name) => name !== STATIC_CACHE && name !== RUNTIME_CACHE)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (!url.protocol.startsWith('http')) return;

    // NAVIGATION: Network first, fall back to cached HTML
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((response) => {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(STATIC_CACHE).then((cache) => {
                            cache.put('/index.html', copy).catch(() => {});
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match('/index.html').then((cached) => {
                        return cached || caches.match('/');
                    });
                })
        );
        return;
    }

    // EVERYTHING ELSE: Cache-first
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;

            return caches.open(RUNTIME_CACHE).then((cache) => {
                return fetch(req)
                    .then((response) => {
                        if (response && (response.status === 200 || response.type === 'opaque')) {
                            cache.put(req, response.clone()).catch(() => {});
                        }
                        return response;
                    })
                    .catch(() => {
                        return new Response('', { status: 408, statusText: 'Offline' });
                    });
            });
        })
    );
});
