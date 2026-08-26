const CACHE_NAME = 'softapp-pro-live';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Langsung aktif tanpa menunggu
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
});

self.addEventListener('activate', (event) => {
    // Hapus semua cache lama setiap kali aplikasi dibuka
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('script.google.com')) return;

    event.respondWith(
        // STRATEGI ULTRA-LIVE: Paksa ambil dari internet tanpa membaca cache browser (cache: 'no-store')
        fetch(event.request, { cache: 'no-store' })
            .then((networkResponse) => {
                // Jika berhasil dapat yang baru, simpan diam-diam untuk mode offline
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // HANYA JIKA OFFLINE (Tidak ada sinyal), baru pakai cache HP
                return caches.match(event.request);
            })
    );
});