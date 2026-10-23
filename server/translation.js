import { fetch, EnvHttpProxyAgent } from 'undici';
import { hash } from './parsers.js';
import { simplifyTranslation } from './chinese.js';

const dispatcher = new EnvHttpProxyAgent();
const model = process.env.TRANSLATION_MODEL || 'qwen-mt-flash';
export function translationKey(item) {
  return hash(JSON.stringify(['zh-CN', model, item.kind === 'news' ? item.title : '', item.description || '']));
}
export async function translateText(text) {
  if (!text?.trim()) return '';
  const key = process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_KEY;
  if (!key) throw Object.assign(new Error('翻译服务尚未配置，请设置 DASHSCOPE_API_KEY 后重启服务'), { status: 503 });
  const base = process.env.TRANSLATION_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    dispatcher, signal: AbortSignal.timeout(25000), method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], translation_options: { source_lang: 'auto', target_lang: 'Chinese' } }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    const message = response.status === 429 ? '翻译请求较多，请稍后再试' : [401, 403].includes(response.status) ? '翻译服务凭证无效或没有调用权限' : `翻译服务暂不可用（${response.status}）`;
    throw Object.assign(new Error(message), { status: 502 });
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;
  if (typeof result !== 'string' || !result.trim() || data.choices?.[0]?.finish_reason === 'length') throw new Error('未获得完整译文，请稍后重试');
  return result.trim();
}
export function createTranslator(store, { translate = translateText, concurrency = 3 } = {}) {
  const pending = new Map();
  return {
    async translate(item) {
      if (item.language === 'zh') return simplifyTranslation({ title: item.title, description: item.description, provider: '原文', cached: true });
      const key = translationKey(item);
      const cached = store.translation(key);
      if (cached) return simplifyTranslation({ ...cached, cached: true });
      if (pending.has(key)) return pending.get(key);
      if (pending.size >= concurrency) throw Object.assign(new Error('正在翻译其他条目，请稍后再试'), { status: 429 });
      const job = Promise.resolve().then(async () => {
        try {
          // Translate fields separately so each Chinese paragraph matches its original.
          // Repository and Skill identifiers remain unchanged.
          const title = item.kind === 'news' ? await translate(item.title) : '';
          const description = item.description ? await translate(item.description) : '';
          const result = simplifyTranslation({ title, description, provider: '通义翻译', model, translatedAt: new Date().toISOString() });
          store.saveTranslation(key, result);
          return { ...result, cached: false };
        } finally { pending.delete(key); }
      });
      pending.set(key, job);
      return job;
    },
  };
}
