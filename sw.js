// sw.js — Paylance Service Worker
// PWA ke liye — offline support + caching

const CACHE_NAME = 'paylance-v3'; // ✅ Version badlo har deploy pe

// Sirf yeh files cache hongi
const STATIC_FILES = [
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
];

// Install — static files cache karo
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_FILES).catch(err => {
                console.warn('[SW] Some files failed to cache:', err);
            });
        })
    );
    self.skipWaiting(); // ✅ Turant activate ho
});

// Activate — purana cache saaf karo
self.addEventListener('activate', event => {
    console.log('[SW] Activated!');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => {
                    console.log('[SW] Deleting old cache:', k);
                    return caches.delete(k);
                })
            )
        )
    );
    self.clients.claim(); // ✅ Sab tabs ko turant update karo
});

// Fetch — NETWORK FIRST (fresh data hamesha milega)
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // API calls — sirf network
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // HTML files — kabhi cache mat karo
    if (request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // JS/CSS/Images — Network first, cache fallback
    event.respondWith(
        fetch(request).then(response => {
            if (response && response.status === 200 && request.method === 'GET') {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
        }).catch(() => caches.match(request)) // Offline fallback
    );
});