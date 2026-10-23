import express from 'express';
import { categories, sources, timezone, schedule } from './config.js';
import { dayKey } from './store.js';
import { createTranslator } from './translation.js';
import { simplified } from './chinese.js';

export function createApi(store, collector, { translator = createTranslator(store) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && req.get('origin') && req.get('origin') !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: '仅允许同源操作' });
    next();
  });
  app.get('/api/status', (_req, res) => {
    const states = new Map(store.states().map(s => [s.source_id, s]));
    res.json({ today: dayKey(), timezone, schedule, categories, dates: store.dates(), progress: collector.progress, sources: sources.map(source => ({ ...source, state: states.get(source.id) || null })), runs: store.runs() });
  });
  app.get('/api/items', (req, res) => {
    const { kind = 'news', category, q = '', date, period, language, source, sort } = req.query;
    if (!['news', 'skills', 'repos', 'saved'].includes(kind)) return res.status(400).json({ error: '无效内容类型' });
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '无效日期' });
    let items = kind === 'saved' ? store.bookmarks() : store.read(date).filter(item => item.kind === kind);
    if (period && kind !== 'saved') items = items.filter(i => i.period === period);
    if (category && category !== 'all') items = items.filter(i => i.category === category);
    if (language && language !== 'all') items = items.filter(i => i.language === language);
    if (source && source !== 'all') items = items.filter(i => i.sourceId === source);
    if (q) { const term = simplified(String(q).toLowerCase().slice(0, 200)); items = items.filter(i => `${i.title} ${i.description} ${i.sourceName} ${i.metrics?.language || ''} ${i.metrics?.owner || ''}`.toLowerCase().includes(term)); }
    const seen = new Set();
    items = items.filter(i => !seen.has(i.id) && seen.add(i.id));
    if (kind === 'news') items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    else if (sort === 'stars') items.sort((a, b) => (b.metrics.stars || 0) - (a.metrics.stars || 0));
    else if (sort === 'installs') items.sort((a, b) => (b.metrics.installs || 0) - (a.metrics.installs || 0));
    else if (kind !== 'saved') items.sort((a, b) => (a.rank || 999) - (b.rank || 999));
    const saved = new Set(store.bookmarks().map(i => i.id));
    res.json({ items: items.map(i => ({ ...i, saved: saved.has(i.id) })), total: items.length });
  });
  app.post('/api/collect', (req, res) => {
    const kind = req.body?.kind;
    if (kind && !['news', 'skills', 'repos'].includes(kind)) return res.status(400).json({ error: '无效采集类型' });
    if (collector.progress.running) return res.status(202).json({ ...collector.progress });
    const lastRun = store.runs()[0];
    if (lastRun && Date.now() - Date.parse(lastRun.started_at) < 60000) return res.status(429).json({ error: '刚刚已采集，请一分钟后再试' });
    collector.collect('manual', kind).catch(console.error);
    res.status(202).json(collector.progress);
  });
  app.post('/api/bookmarks', (req, res) => {
    const item = store.find(req.body?.id);
    if (!item) return res.status(404).json({ error: '未找到内容' });
    store.bookmark(item);
    res.status(201).json({ ok: true });
  });
  app.post('/api/translate', async (req, res) => {
    const { id, date, sourceId } = req.body || {};
    if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) || (sourceId && typeof sourceId !== 'string')) return res.status(400).json({ error: '无效条目信息' });
    const item = store.find(id, { date, sourceId });
    if (!item) return res.status(404).json({ error: '未找到需要翻译的内容' });
    try { res.json(await translator.translate(item)); }
    catch (error) {
      const timedOut = error.name === 'TimeoutError';
      const message = timedOut ? '翻译超时，请点击重试' : error.message === 'fetch failed' ? '暂时无法连接翻译服务，请稍后重试' : error.message;
      res.status(error.status || 502).json({ error: message });
    }
  });
  app.delete('/api/bookmarks/:id', (req, res) => { store.unbookmark(req.params.id); res.json({ ok: true }); });
  app.get('/api/export', (req, res) => {
    const date = req.query.date;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '无效日期' });
    res.attachment(`daily-world-${date || dayKey()}.json`).json({ exportedAt: new Date().toISOString(), timezone, items: store.read(date) });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
  return app;
}
