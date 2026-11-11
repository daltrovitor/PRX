// Hello World
/**
 * PRX Service Worker
 * Suporte a PWA offline completo para iOS (Safari e PWA instalada),
 * Android (Chrome e PWA instalada) e navegadores desktop modernos.
 */

// v6: logo nova (assinatura, sem a barra) na página offline e nos logos pré-armazenados.
// v7: notificações no celular (push e toque na notificação).
// v8: assinatura "NEXT IS YOURS" no logo (a página offline e os logos em cache precisam ser trocados).
const CACHE_NAME = 'prx-offline-v10';
const SLOW_URL = '/slow.html';
const NAVIGATION_TIMEOUT_MS = 6000;
const OFFLINE_URL = '/offline.html';

// Lista de assets críticos pré-armazenados no cache durante o install
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  SLOW_URL,
  '/manifest.json',
  '/brand/prx-app-icon.svg',
  '/brand/prx-app-icon-square.svg',
  '/brand/prx-icon-192.png',
  '/brand/prx-icon-512.png',
  '/brand/prx-full-on-light.svg',
  '/brand/prx-full-on-dark.svg',
  '/brand/prx-symbol-on-light.svg',
  '/brand/prx-symbol-on-dark.svg',
  '/brand/prx-compact-on-light.svg',
  '/brand/prx-compact-on-dark.svg',
];

// Instalação: armazena página offline e assets essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Cacheia os arquivos individualmente para que uma falha em asset opcional não impeça o cache da página offline
        await Promise.all(
          PRECACHE_ASSETS.map((asset) =>
            cache.add(asset).catch((err) => {
              // Falha isolada registrada sem abortar a instalação geral
            })
          )
        );
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Ativação: limpa versões anteriores do cache e assume o controle imediatamente
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Limpeza de caches obsoletos
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      }),
      // Reivindica o controle de todas as abas/clientes ativos
      self.clients.claim(),
      // Habilita navigation preload onde suportado (Safari 15+, Chrome, Edge)
      'navigationPreload' in self.registration
        ? self.registration.navigationPreload.enable().catch(() => {})
        : Promise.resolve(),
    ])
  );
});

// Interceptação de requisições de rede
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Interceptação de Navegações de Páginas (HTML / Documentos)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        let timer;
        const fallback = async (slow) => {
          const cache = await caches.open(CACHE_NAME);
          const page = await cache.match(slow ? SLOW_URL : OFFLINE_URL);
          if (page) return new Response(await page.text(), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
          return new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRX</title><body style="font-family:system-ui;text-align:center;padding:15vh 24px"><h1>PRX</h1><h2>' + (slow ? 'Carregamento demorando' : 'Sem internet') + '</h2><p>Não foi possível carregar a tela. Confira sua conexão.</p><button onclick="location.reload()">Tentar novamente</button></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
        };
        const network = (async () => {
          // Include the preload wait in the timeout; never wait forever for it.
          const preload = await Promise.resolve(event.preloadResponse).catch(() => null);
          return preload || fetch(request);
        })();
        try {
          const response = await Promise.race([
            network,
            new Promise((resolve) => { timer = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS); }),
          ]);
          if (!response) return await fallback(self.navigator.onLine !== false);
          if (response.status >= 500) return await fallback(true);
          return response;
        } catch {
          return await fallback(false);
        } finally {
          clearTimeout(timer);
        }
      })()
    );
    return;
  }

  // 2. Requisições GET para assets estáticos da marca pré-armazenados
  if (request.method === 'GET') {
    const url = new URL(request.url);

    // Cache-first para assets de /brand/, /vendor/ e manifest
    if (url.origin === self.location.origin && (url.pathname.startsWith('/brand/') || url.pathname.startsWith('/vendor/') || url.pathname === '/manifest.json')) {
      event.respondWith(
        caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          }).catch(() => {
            // Em caso de falha offline para imagens não cacheadas, retorna vazio
            return new Response('', { status: 408 });
          });
        })
      );
      return;
    }
  }

  // 3. Demais requisições (API, Supabase, mutations POST/PUT/DELETE): rede pura
});

// Listener para forçar atualização quando solicitado pelo app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notificação no celular (Web Push): convite da Resenha, Pix, liberações.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'PRX';
  const options = {
    body: data.body || '',
    icon: '/brand/prx-icon-192.png',
    badge: '/brand/prx-icon-192.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Toque na notificação: foca o app aberto (navegando até a tela) ou abre um novo.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((focused) => (focused && 'navigate' in focused ? focused.navigate(target) : focused));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
