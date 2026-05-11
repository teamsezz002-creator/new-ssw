self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // We used to intercept /virtual-games/ here for client-side zips.
  // Now it's hosted by the server. We just let the network handle it.
  if (url.pathname.startsWith('/virtual-games/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response("Virtual File Not Found on Server.", { status: 404 });
      })
    );
  }
});
