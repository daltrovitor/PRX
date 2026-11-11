// node --test scripts/test-startup.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function worker({ preload = null, fetcher = async () => new Response('APP'), online = true } = {}) {
  const listeners = {};
  let timeout;
  const context = vm.createContext({
    self: { navigator: { onLine: online }, addEventListener: (name, listener) => { listeners[name] = listener; } },
    caches: { open: async () => ({ match: async path => new Response(path === '/slow.html' ? 'SLOW ANIMATION' : 'OFFLINE ANIMATION') }) },
    fetch: fetcher, Response, URL,
    setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {},
  });
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let response;
  listeners.fetch({ request: { mode: 'navigate' }, preloadResponse: preload, respondWith(promise) { response = promise; } });
  return { response, expire: () => timeout() };
}
test('fast navigation returns app and reuses preload without another request', async () => {
  const app = new Response('PRELOADED');
  const { response } = worker({ preload: Promise.resolve(app), fetcher: async () => { throw Error('must not fetch'); } });
  assert.equal(await response, app);
});
test('slow navigation times out to the dedicated animation', async () => {
  const fixture = worker({ fetcher: () => new Promise(() => {}) });
  fixture.expire();
  const response = await fixture.response;
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), 'SLOW ANIMATION');
});
test('a pending navigation preload is also bounded by the timeout', async () => {
  const fixture = worker({ preload: new Promise(() => {}) });
  fixture.expire();
  assert.equal(await (await fixture.response).text(), 'SLOW ANIMATION');
});
test('offline navigation keeps the existing offline animation', async () => {
  const fixture = worker({ online: false, fetcher: () => new Promise(() => {}) });
  fixture.expire();
  assert.equal(await (await fixture.response).text(), 'OFFLINE ANIMATION');
});
test('network failure uses offline fallback, server failure uses slow fallback', async () => {
  assert.equal(await (await worker({ fetcher: async () => { throw Error('offline'); } }).response).text(), 'OFFLINE ANIMATION');
  assert.equal(await (await worker({ fetcher: async () => new Response('server error', { status: 503 }) }).response).text(), 'SLOW ANIMATION');
});
test('rejected navigation preload still tries the network', async () => {
  const fixture = worker({ preload: Promise.reject(Error('preload')), fetcher: async () => new Response('APP') });
  assert.equal(await (await fixture.response).text(), 'APP');
});
const boot = vm.createContext({});
vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../lib/boot-progress.ts', import.meta.url), 'utf8')).replace(/export /g, ''), boot);
test('startup waits for pending work but settled service errors do not trap the opening screen', () => {
  const summary = boot.summarizeBootTasks;
  assert.equal(summary({}).ready, false);
  assert.equal(summary({ screen: { ready: false }, session: { ready: true } }).percent, 50);
  assert.equal(summary({ screen: { ready: true }, session: { ready: true } }).ready, true);
  assert.equal(summary({ screen: { ready: true }, session: { ready: true } }).percent, 100);
  assert.equal(summary({ screen: { ready: true }, data: { ready: true, error: 'failed' } }).ready, true);
  assert.equal(summary({ screen: { ready: true }, data: { ready: true, error: 'failed' } }).error, 'failed');
  assert.equal(summary({ screen: { ready: true }, data: { ready: true, error: 'failed' } }).percent, 100);
});

test('empty but successful resource responses settle instead of remaining uninitialized', async () => {
  const source = readFileSync(new URL('../components/app/use-prx-stores.ts', import.meta.url), 'utf8');
  const resourceSource = source.slice(source.indexOf('function createResource'), source.indexOf('const SERVER_SNAPSHOT'));
  const context = vm.createContext({ fetchWithTimeout: async () => ({ ok: true, json: async () => ({ account: null }) }) });
  vm.runInContext(stripTypeScriptTypes(resourceSource), context);
  const resource = context.createResource('/api/bank', json => json.account);
  await resource.load('member');
  assert.equal(resource.get().data, null);
  assert.equal(resource.get().loading, false);
  assert.equal(resource.get().settled, true);
});
