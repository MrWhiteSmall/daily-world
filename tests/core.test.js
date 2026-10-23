import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parseRss, parseSkills, parseGithub, safeUrl } from '../server/parsers.js';
import { createStore, dayKey } from '../server/store.js';
import { createCollector } from '../server/collector.js';
import { createApi } from '../server/app.js';

const source = { id: 'test-rss', name: 'Test', kind: 'news', type: 'rss', category: 'world', url: 'https://example.org/feed' };
const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title><link>https://example.org</link><description>Test</description><item><title><![CDATA[Hello &amp; World]]></title><link>https://example.org/article</link><description><![CDATA[<p>Real <b>news</b> &amp; context</p>]]></description><pubDate>Thu, 22 Oct 2026 20:00:00 GMT</pubDate></item><item><title>Bad link</title><link>javascript:alert(1)</link></item></channel></rss>`;
test('RSS parses actual content and dates, strips HTML, rejects executable links', async () => {
  const items = await parseRss(xml, source);
  assert.equal(items.length, 1); assert.equal(items[0].title, 'Hello & World');
  assert.equal(items[0].description, 'Real news & context'); assert.equal(items[0].publishedAt, '2026-10-22T20:00:00.000Z');
  assert.equal(safeUrl('data:text/html,a'), null);
});
test('Skills parses escaped streaming JSON without executing scripts', () => {
  const data = [{ source: 'vercel-labs/skills', skillId: 'find-skills', name: 'find-skills', installs: 3997507, weeklyInstalls: [1, 2, 3], isOfficial: true }];
  const payload = '4c:["$","Component",null,' + JSON.stringify({ initialSkills: data }) + ']';
  const html = `<script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`;
  const items = parseSkills(html, { id: 'skills-all-time', kind: 'skills', name: 'Skills.sh', period: 'all-time' });
  assert.equal(items.length, 1); assert.equal(items[0].metrics.installs, 3997507);
  assert.equal(items[0].metrics.official, true); assert.equal(items[0].rank, 1);
  assert.throws(() => parseSkills('<html>Access denied</html>', source), /未解析/);
});
test('GitHub parses totals separately from period growth and rejects block pages', () => {
  const html = `<article class="Box-row"><h2><a href="/owner/repo">owner / repo</a></h2><p>A useful project</p><span itemprop="programmingLanguage">Python</span><a href="/owner/repo/stargazers">12,345</a><a href="/owner/repo/forks">678</a><span class="float-sm-right">1,234 stars today</span></article>`;
  const [item] = parseGithub(html, { id: 'github-daily', kind: 'repos', name: 'GitHub', period: 'daily' });
  assert.equal(item.metrics.stars, 12345); assert.equal(item.metrics.gained, 1234); assert.equal(item.metrics.forks, 678);
  assert.equal(item.title, 'owner/repo'); assert.throws(() => parseGithub('Too many requests', source), /未解析/);
});
test('Skills supports site-hosted skills without inventing a GitHub install command', () => {
  const payload = JSON.stringify({ initialSkills: [{ source: 'open.feishu.cn', skillId: 'lark-doc', name: 'lark-doc', installs: 1000 }, { source: 'owner/repo', skillId: 'bad;command', name: 'bad' }] });
  const items = parseSkills(`<script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`, { ...source, kind: 'skills' });
  assert.equal(items.length, 1); assert.equal(items[0].url, 'https://skills.sh/site/open.feishu.cn/lark-doc');
  assert.equal(items[0].metrics.installCommand, null);
});
test('daily snapshots use Shanghai midnight; source failures preserve last success and bookmarks', async () => {
  const store = createStore(':memory:');
  try {
    assert.equal(dayKey(new Date('2026-10-22T16:01:00Z')), '2026-10-23');
    const items = await parseRss(xml, source);
    store.save(source.id, items, '2026-10-22T15:00:00Z');
    store.save(source.id, [{ ...items[0], title: 'Next day' }], '2026-10-22T17:00:00Z');
    store.fail(source.id, 'timeout'); store.bookmark(items[0]);
    assert.deepEqual(store.dates(), ['2026-10-23', '2026-10-22']);
    assert.equal(store.read()[0].title, 'Next day'); assert.equal(store.read('2026-10-22')[0].title, 'Hello & World');
    assert.equal(store.states()[0].status, 'error'); assert.equal(store.states()[0].count, 1);
    assert.equal(store.bookmarks()[0].title, 'Hello & World');
    store.unbookmark(items[0].id); assert.equal(store.bookmarks().length, 0);
  } finally { store.close(); }
});
test('collector coalesces overlapping runs and records partial failures without clearing cache', async () => {
  const store = createStore(':memory:');
  const bad = { ...source, id: 'bad', url: 'https://example.org/bad' };
  let calls = 0;
  const collector = createCollector(store, { sourceList: [source, bad], fetcher: async url => { calls++; if (url.endsWith('bad')) throw new Error('offline'); return xml; } });
  try {
    const first = collector.collect('test'), second = collector.collect('test');
    assert.equal(first, second); assert.equal(collector.progress.running, true);
    assert.deepEqual(await first, { successful: 1, failed: 1 });
    assert.equal(calls, 2); assert.equal(collector.progress.completed, 2); assert.equal(collector.progress.running, false);
    assert.equal(store.read().length, 1); assert.equal(store.runs().length, 1);
  } finally { store.close(); }
});
test('HTTP API filters and deduplicates items, persists bookmarks, and rejects cross-origin writes', async () => {
  const store = createStore(':memory:');
  const [item] = await parseRss(xml, source);
  store.save('test-rss', [item]); store.save('duplicate', [{ ...item, sourceId: 'duplicate' }]);
  const server = createApi(store, { progress: { running: false }, collect: async () => ({}) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/`;
  try {
    const result = await fetch(`${url}items?kind=news&q=world`).then(r => r.json());
    assert.equal(result.total, 1);
    assert.equal((await fetch(`${url}items?kind=bogus`)).status, 400);
    assert.equal((await fetch(`${url}items?date=invalid`)).status, 400);
    const cross = await fetch(`${url}bookmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://evil.test' }, body: JSON.stringify({ id: item.id }) });
    assert.equal(cross.status, 403);
    assert.equal((await fetch(`${url}bookmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })).status, 201);
    assert.equal((await fetch(`${url}items?kind=saved`).then(r => r.json())).total, 1);
    assert.equal((await fetch(`${url}items?kind=news`).then(r => r.json())).items[0].saved, true);
    const exported = await fetch(`${url}export`); assert.match(exported.headers.get('content-disposition'), /attachment/);
    await fetch(`${url}bookmarks/${item.id}`, { method: 'DELETE' });
    assert.equal((await fetch(`${url}items?kind=saved`).then(r => r.json())).total, 0);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
