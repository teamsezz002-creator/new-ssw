// Service Worker to serve virtual simulation files from Cache API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Intercept requests to virtual-games paths
  if (url.pathname.startsWith('/virtual-games/')) {
    event.respondWith(
      caches.open('zip-host').then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request);
        });
      })
    );
  }
});