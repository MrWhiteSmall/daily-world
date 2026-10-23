import Parser from 'rss-parser';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';

const parser = new Parser({ customFields: { item: ['media:content', 'media:thumbnail'] } });
export const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);
export function safeUrl(input, base) {
  try { const u = new URL(input, base); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function plain(input = '') { return load(String(input)).text().replace(/\s+/g, ' ').trim(); }
export function count(input = '') {
  const match = String(input).replace(/,/g, '').match(/([\d.]+)\s*([kmb])?/i);
  return match ? Math.round(Number(match[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase()] || 1)) : 0;
}
function base(source, now) { return { kind: source.kind, sourceId: source.id, sourceName: source.name, category: source.category || source.kind, region: source.region || '全球', language: source.language || 'en', fetchedAt: now, period: source.period || null }; }
export async function parseRss(xml, source, now = new Date().toISOString()) {
  const feed = await parser.parseString(xml);
  return feed.items.slice(0, 80).flatMap((item) => {
    const url = safeUrl(item.link);
    if (!url || !item.title) return [];
    const date = new Date(item.isoDate || item.pubDate || '');
    const hackerNews = source.id === 'hacker-news';
    const discussionUrl = hackerNews ? safeUrl(item.comments) : null;
    const identityUrl = hackerNews ? discussionUrl || url : url.replace(/[?#].*$/, '');
    return [{ ...base(source, now), id: hash(`news:${identityUrl}`), title: plain(item.title), description: hackerNews ? '' : plain(item.contentSnippet || item.description || item.content || item.summary).slice(0, 700), url, ...(discussionUrl ? { discussionUrl } : {}), publishedAt: Number.isFinite(date.getTime()) ? date.toISOString() : null, metrics: {} }];
  });
}
// Next.js streams JSON strings. Decode those strings as data; never execute page scripts.
function initialSkills($) {
  for (const el of $('script').toArray()) {
    const script = $(el).text();
    const match = script.match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);
    if (!match) continue;
    try {
      const payload = JSON.parse(match[1])[1];
      if (typeof payload !== 'string') continue;
      const key = '"initialSkills":';
      const start = payload.indexOf(key);
      if (start < 0) continue;
      const json = payload.slice(start + key.length);
      let depth = 0, quoted = false, escaped = false;
      for (let i = 0; i < json.length; i++) {
        const c = json[i];
        if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
        else if (c === '"') quoted = true;
        else if (c === '[' || c === '{') depth++;
        else if ((c === ']' || c === '}') && --depth === 0) return JSON.parse(json.slice(0, i + 1));
      }
    } catch { /* Fall back to public rendered links when the stream format changes. */ }
  }
  return [];
}
export function parseSkills(html, source, now = new Date().toISOString()) {
  const $ = load(html);
  let data = initialSkills($);
  if (!data.length) {
    data = $('a[href]').toArray().flatMap((el) => {
      const parts = ($(el).attr('href') || '').match(/^\/([^/]+)\/([^/]+)\/([^/?#]+)$/);
      if (!parts || !$(el).find('h3').length || parts[1] === '_next') return [];
      return [{ source: `${parts[1]}/${parts[2]}`, skillId: parts[3], name: $(el).find('h3').text(), installs: count($(el).children().last().text()) }];
    });
  }
  const seen = new Set();
  const items = data.slice(0, 300).flatMap((skill, index) => {
    const name = skill.name || skill.skillId;
    const skillId = skill.skillId || name;
    const github = /^[\w.-]+\/[\w.-]+$/.test(skill.source || '');
    const domain = /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i.test(skill.source || '');
    if (!name || !/^[\w.-]+$/.test(skillId || '') || (!github && !domain) || seen.has(`${skill.source}/${name}`)) return [];
    seen.add(`${skill.source}/${name}`);
    return [{ ...base(source, now), id: hash(`skills:${skill.source}/${skillId}`), title: name, description: `由 ${skill.source} 提供的 Agent Skill`, url: `https://skills.sh/${github ? '' : 'site/'}${skill.source}/${encodeURIComponent(skillId)}`, publishedAt: null, rank: index + 1, metrics: { installs: Number(skill.installs) || 0, weeklyInstalls: Array.isArray(skill.weeklyInstalls) ? skill.weeklyInstalls : [], owner: skill.source, official: !!skill.isOfficial, installCommand: github ? `npx skills add ${skill.source} --skill ${skillId}` : null } }];
  });
  if (!items.length) throw new Error('未解析到 Skill 榜单；页面结构可能已变化');
  return items;
}
export function parseGithub(html, source, now = new Date().toISOString()) {
  const $ = load(html);
  const items = $('article.Box-row').toArray().flatMap((el, index) => {
    const row = $(el), link = row.find('h2 a').attr('href');
    if (!/^\/[\w.-]+\/[\w.-]+$/.test(link || '')) return [];
    const name = link.slice(1);
    return [{ ...base(source, now), id: hash(`repos:${name.toLowerCase()}`), title: name, description: row.find('p').text().replace(/\s+/g, ' ').trim(), url: `https://github.com${link}`, publishedAt: null, rank: index + 1, metrics: { language: row.find('[itemprop="programmingLanguage"]').text().trim() || '未标注', stars: count(row.find(`a[href="${link}/stargazers"]`).text()), forks: count(row.find(`a[href="${link}/forks"]`).text()), gained: count(row.find('span.float-sm-right').text()) } }];
  });
  if (!items.length) throw new Error('未解析到 GitHub 榜单；可能遇到访问限制或页面变化');
  return items;
}
