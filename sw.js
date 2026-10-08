// Меняй версию при каждом обновлении игры (чистит старый кэш)
const CACHE = 'sessiya-v15';
const ASSETS = ['./', 'index.html', 'game.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'boss.png', 'boss_kind.png', 'boss_angry.png', 'bakery.png', 'bread.png'];
const NET_TIMEOUT = 4000; // столько ждём сеть, потом отдаём то, что в кэше

self.addEventListener('install', e => {
  // cache:'reload' = берём свежие файлы с сервера, а не из HTTP-кэша браузера
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сначала сеть (всегда свежая версия), а если сети нет или она тормозит, берём из кэша: офлайн работает
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    const res = await Promise.race([
      fetch(fresh),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NET_TIMEOUT))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) ||
           (await cache.match('index.html')) ||
           Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});
