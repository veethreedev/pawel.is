// The old site registered a cache-first service worker at this path.
// This replacement clears its cache and unregisters itself so returning
// visitors get the current site from the network.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await caches.delete('culator_cache');
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.navigate(client.url));
  })());
});
