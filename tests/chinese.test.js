import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStore } from '../server/store.js';
import { createApi } from '../server/app.js';
import { createTranslator, translationKey } from '../server/translation.js';

const item = { id: 'abcdef1234567890abcdef12', kind: 'news', sourceId: 'test', language: 'zh', title: '臺灣新聞：經濟發展與頭髮護理', description: '國際觀察與科學發現，AI news。', url: 'https://example.com/臺灣' };

test('existing snapshots, bookmarks and historical lookups read as simplified without rewriting source data', () => {
  const store = createStore(':memory:');
  try {
    store.save('test', [item], '2026-10-20T01:00:00Z');
    store.bookmark(item);
    store.save('test', [{ ...item, id: 'another-id' }], '2026-10-21T01:00:00Z');
    for (const result of [store.read()[0], store.read('2026-10-20')[0], store.bookmarks()[0], store.find(item.id)]) {
      assert.equal(result.title, '台湾新闻：经济发展与头发护理');
      assert.equal(result.description, '国际观察与科学发现，AI news。');
      assert.equal(result.url, item.url);
    }
    store.unbookmark(item.id);
    assert.equal(store.find(item.id).title, '台湾新闻：经济发展与头发护理');
    const raw = JSON.parse(store.db.prepare('SELECT payload FROM snapshots WHERE day=?').get('2026-10-20').payload)[0];
    assert.equal(raw.title, item.title);
    const repo = { ...item, kind: 'repos', title: 'owner/繁體工具' };
    store.save('repo', [repo]);
    assert.equal(store.find(repo.id).title, repo.title);
  } finally { store.close(); }
});

test('Chinese originals, new translations and existing translation caches all return simplified text', async () => {
  const store = createStore(':memory:'); let calls = 0;
  const translator = createTranslator(store, { translate: async () => { calls++; return '繁體中文與國際新聞'; } });
  try {
    assert.equal((await translator.translate(item)).title, '台湾新闻：经济发展与头发护理');
    assert.equal(calls, 0);
    const english = { ...item, language: 'en', title: 'World news', description: '' };
    assert.equal((await translator.translate(english)).title, '繁体中文与国际新闻');
    assert.equal(calls, 1);
    store.saveTranslation(translationKey(english), { title: '舊譯文：臺灣新聞', description: '科學發現' });
    const cached = await translator.translate(english);
    assert.equal(cached.title, '旧译文：台湾新闻');
    assert.equal(cached.description, '科学发现');
    assert.equal(cached.cached, true); assert.equal(calls, 1);
  } finally { store.close(); }
});

test('API supports simplified and traditional search and exports simplified reading text', async () => {
  const store = createStore(':memory:');
  store.save('test', [item]);
  const server = createApi(store, { progress: {} }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/`;
  try {
    for (const q of ['经济发展', '經濟發展']) {
      const result = await fetch(`${url}items?kind=news&q=${encodeURIComponent(q)}`).then(r => r.json());
      assert.equal(result.total, 1); assert.equal(result.items[0].id, item.id);
    }
    const exported = await fetch(`${url}export`).then(r => r.json());
    assert.equal(exported.items[0].title, '台湾新闻：经济发展与头发护理');
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
