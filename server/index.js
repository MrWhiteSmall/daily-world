import cron from 'node-cron';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createStore } from './store.js';
import { createCollector } from './collector.js';
import { createApi } from './app.js';
import { timezone, schedule } from './config.js';

if (!cron.validate(schedule)) throw new Error('COLLECT_CRON 不是有效的 cron 表达式');
const store = createStore();
const collector = createCollector(store);
const app = createApi(store, collector);
let vite;
if (existsSync(resolve('dist/index.html')) && process.env.NODE_ENV !== 'development') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 48931);
const server = app.listen(port, host, (error) => {
  if (error) {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请设置 PORT 为其他端口后启动。` : error);
    process.exit(1);
  }
  console.log(`\n  望远镜 · Daily World  http://${host}:${port}\n  自动采集 ${schedule} (${timezone})\n`);
  // Catch up once after downtime. Failed sources remain visible and can be retried manually.
  const lastRun = store.runs().find(run => run.finished_at);
  if (process.env.AUTO_COLLECT !== 'false' && (!lastRun || Date.now() - Date.parse(lastRun.started_at) >= 2 * 60 * 60 * 1000)) collector.collect('startup').catch(console.error);
});
const task = cron.schedule(schedule, () => collector.collect('scheduled').catch(console.error), { timezone });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  task.stop();
  const timeout = setTimeout(() => process.exit(1), 25000).unref();
  await new Promise(resolve => server.close(resolve));
  if (collector.progress.running) await collector.collect('shutdown');
  await vite?.close();
  store.close();
  clearTimeout(timeout);
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
