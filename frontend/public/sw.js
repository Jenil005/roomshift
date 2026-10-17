const CACHE_NAME = 'roomshift-shell-v2'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

async function precacheBuiltAssets(cache) {
  const response = await fetch('/index.html', { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not read the app shell during install.')
  const html = await response.text()
  const entryAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'))
  await cache.addAll(entryAssets.map((url) => url.href))

  const cssAssets = entryAssets.filter((url) => url.pathname.endsWith('.css'))
  const fontAssets = new Set()
  for (const url of cssAssets) {
    const css = await (await cache.match(url.href)).text()
    for (const match of css.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) {
      const asset = new URL(match[1], url)
      if (asset.origin === self.location.origin && asset.pathname.startsWith('/assets/')) fontAssets.add(asset.href)
    }
  }
  if (fontAssets.size) await cache.addAll([...fontAssets])
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(APP_SHELL)
    await precacheBuiltAssets(cache)
  }).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', response.clone()))
      return response
    }).catch(() => caches.match('/index.html').then((response) => response || caches.match('/'))))
    return
  }
  event.respondWith(caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      if (response.ok && new URL(request.url).pathname.startsWith('/assets/')) {
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      }
      return response
    })
  }))
})
