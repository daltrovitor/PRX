// node --test scripts/test-reel-upload.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function fixture() {
  let xhr;
  class MockXHR {
    upload = {};
    headers = {};
    constructor() { xhr = this; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { this.body = body; }
  }
  const context = vm.createContext({ XMLHttpRequest: MockXHR });
  const source = stripTypeScriptTypes(readFileSync(new URL('../lib/media/upload-with-progress.ts', import.meta.url), 'utf8')).replace('export ', '');
  vm.runInContext(source, context);
  const values = [];
  const body = new FormData();
  const promise = context.uploadWithProgress('https://storage.example/upload', 'PUT', body, { apikey: 'public' }, value => values.push(value));
  return { promise, values, xhr, body };
}
test('reports bytes transferred and waits for successful response before 100%', async () => {
  const { xhr, promise, values, body } = fixture();
  assert.equal(xhr.method, 'PUT');
  assert.equal(xhr.body, body);
  assert.equal(xhr.headers.apikey, 'public');
  xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  xhr.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
  assert.deepEqual(values, [0, 50, 99]);
  xhr.status = 200; xhr.responseText = '{}'; xhr.onload();
  assert.equal(await promise, '{}');
  assert.deepEqual(values, [0, 50, 99, 100]);
});
test('unknown transfer size uses an indeterminate indicator', async () => {
  const { xhr, promise, values } = fixture();
  xhr.upload.onprogress({ lengthComputable: false });
  assert.deepEqual(values, [0, null]);
  xhr.status = 201; xhr.responseText = '{}'; xhr.onload();
  await promise;
});
test('failed HTTP response never reports 100%', async () => {
  const { xhr, promise, values } = fixture();
  xhr.status = 403; xhr.onload();
  await assert.rejects(() => promise, /403/);
  assert.deepEqual(values, [0]);
});
test('network errors, timeouts and cancellations reject without completion', async () => {
  for (const event of ['onerror', 'ontimeout', 'onabort']) {
    const { xhr, promise, values } = fixture();
    xhr[event]();
    await assert.rejects(() => promise);
    assert.deepEqual(values, [0]);
  }
});
