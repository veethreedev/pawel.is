// A unique name for your cache
const CACHE_NAME = 'culator_cache';

// List of static assets to cache immediately during the 'install' event
const urlsToCache = [
  './',
  './culator.html',
  './javascript/culator.js',
  './javascript/service-worker.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-latest.js',
  './icons/android/android-launchericon-192-192.png',
  './icons/android/android-launchericon-512-512.png'
];

// Install Event: Cache the static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch Event: Serve from cache if available, otherwise network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return the response from the cache
        if (response) {
          return response;
        }
        // Not in cache, fetch from the network
        return fetch(event.request);
      }
    )
  );
});
