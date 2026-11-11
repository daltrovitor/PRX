import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function load(path, bindings = {}) {
  const ctx = vm.createContext({ File, Blob, Response, AbortController, ...bindings });
  vm.runInContext(stripTypeScriptTypes(read(path)).replace(/export /g, ''), ctx);
  return ctx;
}
const frame = { readyState: 2, seeking: false, videoWidth: 1920, videoHeight: 1080, currentTime: 2.5 };
test('selected video frame becomes a scaled JPEG ready to upload', async () => {
  let canvas;
  const ctx = load('lib/media/video-poster.ts', { document: { createElement() { return canvas = {
    getContext: () => ({ drawImage(video) { assert.equal(video.currentTime, 2.5); } }),
    toBlob(callback, type) { assert.equal(type, 'image/jpeg'); callback(new Blob(['jpeg'], { type })); },
  }; } } });
  const file = await ctx.videoPosterFile(frame);
  assert.equal(file.type, 'image/jpeg');
  assert.equal(file.name, 'capa-2500.jpg');
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 608);
});
test('frame capture rejects unloaded and still-seeking videos', async () => {
  const ctx = load('lib/media/video-poster.ts');
  await assert.rejects(() => ctx.videoPosterFile({ ...frame, readyState: 1 }), /Aguarde/);
  await assert.rejects(() => ctx.videoPosterFile({ ...frame, seeking: true }), /Aguarde/);
});
test('external video CORS restrictions offer the manual cover fallback', async () => {
  const ctx = load('lib/media/video-poster.ts', { document: { createElement: () => ({ getContext: () => ({ drawImage() { throw Error('SecurityError'); } }) }) } });
  await assert.rejects(() => ctx.videoPosterFile(frame), /manualmente/);
});
test('notification invitation is shown once, including legacy dismissals', () => {
  const values = new Map();
  const bindings = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } };
  const ctx = load('lib/push-prompt-policy.ts', bindings);
  assert.equal(ctx.hasSeenPushPrompt(), false);
  ctx.markPushPromptSeen();
  assert.equal(ctx.hasSeenPushPrompt(), true);
  assert.equal(load('lib/push-prompt-policy.ts', bindings).hasSeenPushPrompt(), true);
  values.clear(); values.set('prx_push_popup_dismissed_at', '123');
  assert.equal(load('lib/push-prompt-policy.ts', bindings).hasSeenPushPrompt(), true);
});
test('blocked storage still remembers notification invitation in this tab', () => {
  const ctx = load('lib/push-prompt-policy.ts', { localStorage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
  ctx.markPushPromptSeen(); assert.equal(ctx.hasSeenPushPrompt(), true);
});
test('initial request timeout also covers a stalled response body', async () => {
  let expire;
  const ctx = load('lib/client-fetch.ts', {
    setTimeout: callback => { expire = callback; return 1; }, clearTimeout() {},
    fetch: async (_input, init) => ({ text: () => new Promise((_resolve, reject) => { if (init.signal.aborted) reject(Error('aborted')); else init.signal.addEventListener('abort', () => reject(Error('aborted'))); }) }),
  });
  const request = ctx.fetchWithTimeout('/api/bank');
  await Promise.resolve(); expire();
  await assert.rejects(() => request, /aborted/);
});
test('successful initial response stays readable as JSON', async () => {
  const ctx = load('lib/client-fetch.ts', { setTimeout, clearTimeout, fetch: async () => new Response('{"ok":true}', { status: 200 }) });
  assert.equal((await (await ctx.fetchWithTimeout('/api/bank')).json()).ok, true);
});
