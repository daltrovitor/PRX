// Dependency-free regression tests: node --test scripts/test-reel-cleanup.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function moduleUnderTest(path, bindings) {
  const source = stripTypeScriptTypes(readFileSync(new URL('../' + path, import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  const context = vm.createContext({ URL, ...bindings });
  vm.runInContext(source, context);
  return context;
}
const base = 'https://our.supabase.co/storage/v1/object/public/reels/';
const path = 'videos/1794400000000_abcdef123456.mp4';
const url = base + path;
function cleanupFixture({ referenced = false, lookupError = false, removeError = false } = {}) {
  const calls = [];
  const context = moduleUnderTest('lib/reels/media-cleanup.ts', {
    removeUnusedMemoryMedia() {},
    supabaseAdmin: {
      storage: { from(bucket) { assert.equal(bucket, 'reels'); return {
        getPublicUrl: () => ({ data: { publicUrl: base } }),
        remove: async paths => { calls.push(paths); return { error: removeError }; },
      }; } },
      from(table) { assert.equal(table, 'partner_reels'); return {
        select() { return this; },
        or(filter) { assert.match(filter, /video_url/); assert.match(filter, /poster_url/); return this; },
        limit: async () => ({ data: referenced ? [{ id: 'another' }] : [], error: lookupError }),
      }; },
    },
  });
  return { context, calls };
}
test('removes only videos generated in our bucket; accepts query strings', async () => {
  const { context, calls } = cleanupFixture();
  assert.equal(await context.cleanupReelVideo(url + '?download=1'), undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], path);
  for (const other of [url.replace('our.supabase.co', 'other.supabase.co'), url.replace('/reels/', '/avatars/'), base + 'posters/1794400000000_abcdef123456.jpg', base + 'videos/custom.mp4', 'https://cdn.example/video.mp4']) {
    await context.cleanupReelVideo(other);
  }
  assert.equal(calls.length, 1);
});
test('keeps shared videos including inactive records and skips on lookup failure', async () => {
  for (const options of [{ referenced: true }, { lookupError: true }]) {
    const { context, calls } = cleanupFixture(options);
    const warning = await context.cleanupReelVideo(url);
    assert.equal(calls.length, 0);
    assert.equal(Boolean(warning), Boolean(options.lookupError));
  }
});
test('Storage failure returns a warning', async () => {
  const { context } = cleanupFixture({ removeError: true });
  assert.match(await context.cleanupReelVideo(url), /Storage/);
});
function serviceFixture({ fail = false, warning } = {}) {
  const calls = [];
  const previous = { id: 'reel', videoUrl: url };
  class PartnerError extends Error {}
  const repo = {
    get: async () => previous,
    update: async (_id, input) => { calls.push('save'); if (fail) throw Error('write failed'); return { ...previous, ...input }; },
    remove: async () => { calls.push('delete'); if (fail) throw Error('write failed'); return true; },
  };
  const context = moduleUnderTest('lib/reels/service.ts', {
    PartnerError, getReelsRepository: () => repo,
    cleanupReelVideo: async value => { calls.push('cleanup:' + value); return warning; },
  });
  return { context, calls };
}
test('update cleans the old video only after successful save', async () => {
  const { context, calls } = serviceFixture();
  await context.updateReel('reel', { partnerId: '', videoUrl: 'https://cdn/new.mp4' });
  assert.deepEqual(calls, ['save', 'cleanup:' + url]);
});
test('unchanged URL never triggers cleanup', async () => {
  const { context, calls } = serviceFixture();
  await context.updateReel('reel', { partnerId: '', videoUrl: url });
  assert.deepEqual(calls, ['save']);
});
test('failed save or deletion keeps the previous file', async () => {
  for (const action of ['updateReel', 'deleteReel']) {
    const { context, calls } = serviceFixture({ fail: true });
    await assert.rejects(() => context[action]('reel', { partnerId: '', videoUrl: 'https://cdn/new.mp4' }), /write failed/);
    assert.equal(calls.length, 1);
  }
});
test('delete cleans only after record deletion and preserves cleanup warning', async () => {
  const { context, calls } = serviceFixture({ warning: 'Destaque salvo: Storage indisponível' });
  const result = await context.deleteReel('reel');
  assert.deepEqual(calls, ['delete', 'cleanup:' + url]);
  assert.match(result.cleanupWarning, /excluído/);
});
