const CACHE_NAME = 'softapp-pro-cloud-v1'; // Nama cache baru untuk mereset yang lama
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// Saat aplikasi pertama kali diinstal
self.addEventListener('install', (event) => {
    // Memaksa Service Worker baru untuk langsung mengambil alih tanpa menunggu
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Menyiapkan cache cadangan untuk mode Offline...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Menghapus SEMUA cache versi lama secara otomatis
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Menghapus cache PWA versi lama:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Memastikan tab browser yang sedang terbuka langsung menggunakan versi baru
    self.clients.claim(); 
});

// STRATEGI BARU: NETWORK-FIRST (Utamakan Cloud/Internet, Cache hanya untuk cadangan saat Offline)
self.addEventListener('fetch', (event) => {
    // Abaikan permintaan ke Google Apps Script
    if (event.request.url.includes('script.google.com')) return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Jika internet menyala dan berhasil mengambil file terbaru dari Cloud,
                // simpan diam-diam ke dalam cache untuk persiapan jika sewaktu-waktu Offline.
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // JIKA OFFLINE (Gagal fetch dari internet), barulah ambil dari Cache HP
                console.log('Sedang offline, mengambil dari cache PWA:', event.request.url);
                return caches.match(event.request);
            })
    );
});