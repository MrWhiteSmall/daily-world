import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStore } from '../server/store.js';
import { createTranslator, translationKey } from '../server/translation.js';
import { createApi } from '../server/app.js';

const item = { id: '1234567890abcdef12345678', kind: 'news', language: 'en', sourceId: 'test', title: 'Science news', description: 'A new discovery.' };
test('translation coalesces duplicate requests, caches both fields, and invalidates changed content', async () => {
  const store = createStore(':memory:'); let calls = 0;
  const translator = createTranslator(store, { translate: async text => { calls++; return `中文：${text}`; } });
  try {
    const [a, b] = await Promise.all([translator.translate(item), translator.translate(item)]);
    assert.equal(calls, 2); assert.equal(a.title, '中文：Science news'); assert.deepEqual(a, b);
    assert.equal((await translator.translate(item)).cached, true); assert.equal(calls, 2);
    const revised = { ...item, description: 'A revised story.' };
    assert.notEqual(translationKey(item), translationKey(revised));
    assert.equal((await translator.translate(revised)).description, '中文：A revised story.'); assert.equal(calls, 4);
  } finally { store.close(); }
});
test('translation failures are retryable and partial results are never cached', async () => {
  const store = createStore(':memory:'); let calls = 0;
  const translator = createTranslator(store, { translate: async text => { if (++calls === 2) throw new Error('offline'); return `中文：${text}`; } });
  try {
    await assert.rejects(translator.translate(item), /offline/);
    assert.equal(store.translation(translationKey(item)), null);
    assert.equal((await translator.translate(item)).cached, false); assert.equal(calls, 4);
  } finally { store.close(); }
});
test('repository identifiers are preserved; Chinese originals require no provider call', async () => {
  const store = createStore(':memory:'); const seen = [];
  const translator = createTranslator(store, { translate: async text => { seen.push(text); return '项目中文介绍'; } });
  try {
    const result = await translator.translate({ ...item, kind: 'repos', title: 'owner/repo' });
    assert.deepEqual(seen, ['A new discovery.']); assert.equal(result.title, ''); assert.equal(result.description, '项目中文介绍');
    const zh = await translator.translate({ ...item, language: 'zh', title: '中文新闻' });
    assert.equal(zh.title, '中文新闻'); assert.equal(seen.length, 1);
  } finally { store.close(); }
});
test('translation concurrency limit rejects extra jobs without calling the provider', async () => {
  const store = createStore(':memory:'); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const translator = createTranslator(store, { concurrency: 1, translate: async () => { await gate; return '中文'; } });
  try {
    const first = translator.translate(item);
    await assert.rejects(translator.translate({ ...item, description: 'Other story' }), error => error.status === 429);
    release(); await first;
  } finally { store.close(); }
});
test('translation API resolves only stored content and honors selected historical snapshots', async () => {
  const store = createStore(':memory:'); const seen = [];
  store.save('test', [item], '2026-10-20T01:00:00Z');
  store.save('test', [{ ...item, description: 'Updated content' }], '2026-10-21T01:00:00Z');
  const translator = createTranslator(store, { translate: async text => { seen.push(text); return '译文'; } });
  const server = createApi(store, { progress: {}, collect: async () => {} }, { translator }).listen(0, '127.0.0.1');
  await once(server, 'listening'); const url = `http://127.0.0.1:${server.address().port}/api/translate`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ text: 'arbitrary' })).status, 400);
    assert.equal((await post({ id: '000000000000000000000000' })).status, 404);
    const res = await post({ id: item.id, date: '2026-10-20', sourceId: 'test', description: 'Client-injected text' });
    assert.equal(res.status, 200); assert.equal((await res.json()).description, '译文');
    assert.deepEqual(seen, ['Science news', 'A new discovery.']);
    assert.equal((await (await post({ id: item.id, date: '2026-10-20', sourceId: 'test' })).json()).cached, true);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
