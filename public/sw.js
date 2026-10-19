// Hello World
/**
 * PRX Service Worker
 * Suporte a PWA offline completo para iOS (Safari e PWA instalada),
 * Android (Chrome e PWA instalada) e navegadores desktop modernos.
 */

// v6: logo nova (assinatura "the next pays", sem a barra) na página offline e nos logos pré-armazenados.
// v7: notificações no celular (push e toque na notificação).
const CACHE_NAME = 'prx-offline-v7';
const OFFLINE_URL = '/offline.html';

// Lista de assets críticos pré-armazenados no cache durante o install
const PRECACHE_ASSETS = [
  OFFLINE_URL,
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
  '/vendor/gsap.min.js',
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
        try {
          // Tenta utilizar a resposta pré-carregada (Navigation Preload) se disponível
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }

          // Tenta buscar da rede normalmente
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 502 || networkResponse.status === 503 || networkResponse.status === 504)) {
            const cache = await caches.open(CACHE_NAME);
            const cachedOfflinePage = await cache.match(OFFLINE_URL);
            if (cachedOfflinePage) {
              return cachedOfflinePage;
            }
          }
          return networkResponse;
        } catch (networkError) {
          // Falha real de conexão (offline, DNS, timeout): entrega a página offline personalizada
          const cache = await caches.open(CACHE_NAME);
          const cachedOfflinePage = await cache.match(OFFLINE_URL);
          if (cachedOfflinePage) {
            return cachedOfflinePage;
          }

          // Fallback seguro caso o cache esteja vazio
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head><body><h1>PRX Offline</h1><p>Sem conexão com a internet.</p></body></html>',
            {
              status: 503,
              statusText: 'Service Unavailable (Offline)',
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
          );
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
