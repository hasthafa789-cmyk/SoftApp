const CACHE_NAME = 'softapp-pro-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// Saat aplikasi pertama kali diinstal
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Melakukan caching aset inti...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Menghapus cache versi lama jika ada pembaruan
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Mencegat permohonan jaringan untuk mode Offline
self.addEventListener('fetch', (event) => {
    // Abaikan permintaan ke Google Apps Script (biarkan ditangani app.js)
    if (event.request.url.includes('script.google.com')) return;

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Kembalikan dari cache jika ada, jika tidak, fetch dari internet
            return response || fetch(event.request);
        })
    );
});