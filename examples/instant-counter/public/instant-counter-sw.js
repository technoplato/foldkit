const cacheName = 'foldkit-instant-counter-shell-v1'
const shellPaths = ['/', '/index.html', '__FOLDKIT_BUILD_ASSETS__']

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then(cache => cache.addAll(shellPaths))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.filter(key => key !== cacheName).map(key => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(cacheName).then(cache => cache.match('/index.html')),
      ),
    )
    return
  }
  if (url.search.length > 0) {
    return
  }
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached !== undefined) {
        return cached
      }
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(cacheName).then(cache => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
