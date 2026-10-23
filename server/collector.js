import { fetch, EnvHttpProxyAgent } from 'undici';
import { setTimeout as delay } from 'node:timers/promises';
import { sources } from './config.js';
import { parseRss, parseSkills, parseGithub } from './parsers.js';

const dispatcher = new EnvHttpProxyAgent();
async function requestText(url) {
  const res = await fetch(url, { dispatcher, signal: AbortSignal.timeout(18000), headers: { 'user-agent': 'DailyWorld/1.0 (+local personal RSS and public leaderboard reader)', accept: 'application/rss+xml,application/atom+xml,text/html,application/xml;q=0.9,*/*;q=0.8' } });
  if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 5_000_000) throw new Error('响应超过 5 MB 限制');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function fetchText(url) {
  try { return await requestText(url); }
  catch (error) {
    if (error.message !== 'fetch failed' && error.name !== 'TimeoutError' && !/^HTTP 5\d\d$/.test(error.message)) throw error;
    await delay(500);
    return requestText(url);
  }
}
export function createCollector(store, { fetcher = fetchText, sourceList = sources } = {}) {
  let active = null;
  const progress = { running: false, completed: 0, total: 0, current: null, startedAt: null };
  return {
    get progress() { return { ...progress }; },
    collect(reason = 'manual', kind) {
      if (active) return active;
      const selected = sourceList.filter(s => !kind || s.kind === kind);
      const run = store.startRun(reason);
      Object.assign(progress, { running: true, completed: 0, total: selected.length, current: null, startedAt: new Date().toISOString() });
      active = (async () => {
        let cursor = 0, successful = 0, failed = 0;
        const worker = async () => {
          while (cursor < selected.length) {
            const source = selected[cursor++];
            progress.current = source.name;
            try {
              const body = await fetcher(source.url);
              const parse = { rss: parseRss, skills: parseSkills, github: parseGithub }[source.type];
              const at = new Date().toISOString();
              const items = await parse(body, source, at);
              if (!items.length) throw new Error('来源返回空内容');
              store.save(source.id, items, at);
              successful++;
              console.log(`[collect] ${source.id}: ${items.length} items`);
            } catch (error) {
              store.fail(source.id, `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`);
              failed++;
              console.warn(`[collect] ${source.id}: ${error.message}`);
            } finally { progress.completed++; }
          }
        };
        try { await Promise.all(Array.from({ length: Math.min(4, selected.length) }, worker)); }
        finally { store.finishRun(run, successful, failed); progress.running = false; progress.current = null; active = null; }
        return { successful, failed };
      })();
      return active;
    },
  };
}
