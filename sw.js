const CACHE_NAME = 'gym-app-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/gim.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                // Fallback offline si no hay red ni caché
                if (event.request.url.includes('supabase')) {
                    return new Response(JSON.stringify({ error: 'Offline' }), { status: 503 });
                }
            });
        })
    );
});