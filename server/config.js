export const timezone = process.env.TZ_NAME || 'Asia/Shanghai';
export const schedule = process.env.COLLECT_CRON || '0 8 * * *';
export const categories = [
  { id: 'all', label: '全部资讯' }, { id: 'world', label: '全球要闻' },
  { id: 'technology', label: '科技数码' }, { id: 'ai', label: '人工智能' },
  { id: 'business', label: '商业财经' }, { id: 'science', label: '科学探索' },
  { id: 'health', label: '健康生活' }, { id: 'climate', label: '气候环境' },
  { id: 'culture', label: '文化体育' },
];
const rss = (id, name, url, category, region = '全球', language = 'en') => ({ id, name, url, category, region, language, kind: 'news', type: 'rss' });
export const sources = [
  rss('bbc-world', 'BBC · 全球', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'world'),
  rss('dw-world', 'DW · 国际', 'https://rss.dw.com/rdf/rss-en-world', 'world'),
  rss('bbc-tech', 'BBC · 科技', 'https://feeds.bbci.co.uk/news/technology/rss.xml', 'technology'),
  rss('tc-ai', 'TechCrunch · AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'ai'),
  rss('bbc-business', 'BBC · 商业', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'business'),
  rss('guardian-business', 'The Guardian · 财经', 'https://www.theguardian.com/business/rss', 'business'),
  rss('bbc-science', 'BBC · 科学', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'science'),
  rss('nature', 'Nature', 'https://www.nature.com/nature.rss', 'science'),
  rss('bbc-health', 'BBC · 健康', 'https://feeds.bbci.co.uk/news/health/rss.xml', 'health'),
  rss('guardian-climate', 'The Guardian · 环境', 'https://www.theguardian.com/environment/rss', 'climate'),
  rss('bbc-culture', 'BBC · 文化', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', 'culture'),
  rss('bbc-sports', 'BBC · 体育', 'https://feeds.bbci.co.uk/sport/rss.xml', 'culture'),
  rss('bbc-chinese', 'BBC · 中文', 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', 'world', '全球', 'zh'),
  ...[['all-time', '', '累计安装'], ['trending', '/trending', '24h 趋势'], ['hot', '/hot', '热门增长']].map(([period, path, label]) => ({ id: `skills-${period}`, name: `Skills.sh · ${label}`, kind: 'skills', type: 'skills', url: `https://skills.sh${path}`, period })),
  ...[['daily', '今日'], ['weekly', '本周'], ['monthly', '本月']].map(([period, label]) => ({ id: `github-${period}`, name: `GitHub Trending · ${label}`, kind: 'repos', type: 'github', url: `https://github.com/trending?since=${period}`, period })),
];
