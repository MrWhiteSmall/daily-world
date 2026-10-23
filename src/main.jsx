import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, CircleHelp, Code2, Compass, Copy, ExternalLink, Flame, Github, Globe2, Languages, Layers3, Newspaper, Radio, RefreshCw, Search, SlidersHorizontal, Sparkles, Star, Telescope, Wifi, X } from 'lucide-react';
import './style.css';

const pages = [
  ['overview', '今日概览', Compass], ['news', '全球新闻', Newspaper],
  ['skills', 'Skill 热榜', Sparkles], ['repos', '开源热榜', Code2],
  ['saved', '我的收藏', Bookmark], ['sources', '数据源', Radio],
];
const categoryNames = { world: '全球要闻', technology: '科技数码', ai: '人工智能', business: '商业财经', science: '科学探索', health: '健康生活', climate: '气候环境', culture: '文化体育', skills: 'Agent Skill', repos: '开源项目' };
const categoryColors = { world: '#375f8d', technology: '#755498', ai: '#1c7463', business: '#a87527', science: '#3d737d', health: '#9a5b6b', climate: '#5b7440', culture: '#ad674b' };
const fmt = n => new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
function dateLabel(date, short = false) {
  if (!date) return '时间未提供';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: short ? '2-digit' : 'long', day: 'numeric', ...(short ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(date));
}
async function api(path, options) {
  const res = await fetch(`/api/${path}`, options ? { headers: { 'Content-Type': 'application/json' }, ...options } : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}
function GlobeArt() {
  return <svg className="globe-art" viewBox="0 0 330 250" aria-hidden="true"><defs><radialGradient id="glow"><stop stopColor="#d8ebff" stopOpacity=".12"/><stop offset="1" stopColor="#d8ebff" stopOpacity="0"/></radialGradient></defs><circle cx="177" cy="123" r="121" fill="url(#glow)"/><g transform="rotate(-22 177 123)" fill="none" stroke="#9bc3ef" strokeWidth=".65"><circle cx="177" cy="123" r="91"/><ellipse cx="177" cy="123" rx="61" ry="91"/><ellipse cx="177" cy="123" rx="27" ry="91"/><ellipse cx="177" cy="123" rx="91" ry="35"/><ellipse cx="177" cy="123" rx="91" ry="67"/><path d="M86 123h182M177 32v182"/><path d="m121 57 15 19 22-6 12 19-11 12 8 15-17 14-13-5-10 16-19-3-10-24 7-13-4-15m55 36 20 5 7 18-6 21-9 12-4 20-11-12-3-25-11-13zm35-75 18 8 1 13 24 5 3 18-13 8-7 17-15-7-5-18-15-4-3-18m43 74-9 18 11 10 11-7 7 8-3 15-17-1-13-16" strokeWidth="1.1"/><ellipse cx="177" cy="123" rx="119" ry="28" transform="rotate(-25 177 123)" strokeDasharray="3 5" strokeOpacity=".7"/></g><g fill="#c5e3ff"><circle cx="154" cy="80" r="3"/><circle cx="221" cy="110" r="3"/><circle cx="134" cy="150" r="3"/></g><g fill="none" stroke="#c5e3ff" strokeOpacity=".4"><circle cx="154" cy="80" r="8"/><circle cx="221" cy="110" r="8"/></g><text x="30" y="229" fill="#a5c7ef" fontFamily="monospace" fontSize="9" letterSpacing="2">35° N / 104° E — CONNECTED</text></svg>;
}
function Sparkline({ values = [] }) {
  if (!values.length) return <span className="muted">—</span>;
  const max = Math.max(...values, 1), min = Math.min(...values);
  const points = values.map((n, i) => `${i * 80 / Math.max(values.length - 1, 1)},${25 - (n - min) / (max - min || 1) * 22}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 80 28" role="img" aria-label={`每周安装趋势：${values.join('、')}`}><polyline points={`0,28 ${points} 80,28`} fill="#e3edfc"/><polyline points={points} fill="none" stroke="#3b77c4" strokeWidth="1.8" strokeLinejoin="round"/></svg>;
}
function Tag({ category }) { return <span className="tag" style={{ '--tag-color': categoryColors[category] || '#3c6599' }}>{categoryNames[category] || category}</span>; }
function SaveButton({ item, onSave }) { return <button className={`icon-button save-button ${item.saved ? 'is-saved' : ''}`} aria-label={item.saved ? '取消收藏' : '收藏'} title={item.saved ? '取消收藏' : '收藏'} onClick={() => onSave(item)}><Bookmark size={17} fill={item.saved ? 'currentColor' : 'none'}/></button>; }
function Empty({ title = '这里还没有内容', children, icon: Icon = Telescope }) { return <div className="empty"><span className="empty-icon"><Icon size={32}/></span><h3>{title}</h3><p>{children || '试试其他分类或关键词，换个角度发现世界。'}</p></div>; }
const translationCache = new Map();
function useTranslation(item) {
  const key = JSON.stringify([item.id, item.title, item.description]);
  const [data, setData] = useState(() => translationCache.get(key));
  const [visible, setVisible] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
  const controlsId = useId();
  const currentKey = useRef(key);
  currentKey.current = key;
  useEffect(() => { setData(translationCache.get(key)); setVisible(false); setError(''); setPending(false); }, [key]);
  const available = item.language !== 'zh' && item.kind !== 'skills' && (item.kind === 'news' || !!item.description);
  async function toggle() {
    if (data) { setVisible(v => !v); return; }
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await api('translate', { method: 'POST', body: JSON.stringify({ id: item.id, date: item.snapshotDate, sourceId: item.sourceId }) });
      translationCache.set(key, result);
      if (currentKey.current === key) { setData(result); setVisible(true); }
    } catch (e) { if (currentKey.current === key) setError(e.message); }
    finally { if (currentKey.current === key) setPending(false); }
  }
  return { data, visible, pending, error, available, toggle, controlsId };
}
function TranslatedText({ translation, field }) {
  return translation.visible && translation.data?.[field] ? <p id={`${translation.controlsId}-${field}`} className={`translated-text translated-${field}`} lang="zh-CN"><span className="translation-label">中文</span>{translation.data[field]}</p> : null;
}
function TranslationControl({ translation }) {
  if (!translation.available) return null;
  return <div className="translation-section"><div className="translation-actions"><button className="translate-button" onClick={translation.toggle} disabled={translation.pending} aria-expanded={translation.visible} aria-controls={translation.visible ? ['title', 'description'].filter(field => translation.data?.[field]).map(field => `${translation.controlsId}-${field}`).join(' ') : undefined}><Languages size={13} className={translation.pending ? 'spin' : ''}/>{translation.pending ? '翻译中…' : translation.error ? '重试翻译' : translation.data ? translation.visible ? '隐藏译文' : '显示译文' : '译为中文'}</button>{translation.visible && <span className="translation-credit">机器翻译</span>}</div>{translation.error && <p className="translation-error" role="alert">{translation.error}</p>}</div>;
}
function NewsCard({ item, onSave, index = 0, compact = false }) {
  const translation = useTranslation(item);
  return <article className={`news-card ${compact ? 'compact' : ''} ${translation.visible ? 'translation-open' : ''}`} style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}><div className="card-meta"><Tag category={item.category}/><span>{item.sourceName}</span><SaveButton item={item} onSave={onSave}/></div><a className="news-title" href={item.url} target="_blank" rel="noreferrer"><h3>{item.title}</h3><ArrowUpRight size={17}/></a><TranslatedText translation={translation} field="title"/>{!compact && <><p className="news-description">{item.description || '点击标题前往来源网站阅读完整报道。'}</p><TranslatedText translation={translation} field="description"/></>}<TranslationControl translation={translation}/><div className="card-footer"><span>{dateLabel(item.publishedAt, true)}</span><span>{item.language === 'zh' ? '中文' : 'EN'} · 原文 <ExternalLink size={11}/></span></div></article>;
}
function RepoCard({ item, onSave }) {
  const translation = useTranslation(item);
  return <article className={`repo-card ${translation.visible ? 'translation-open' : ''}`}><div className="repo-card-top"><span className="repo-icon"><Github size={23}/></span><span className="rank-label">TRENDING #{String(item.rank).padStart(2, '0')}</span><SaveButton item={item} onSave={onSave}/></div><a href={item.url} className="repo-title" target="_blank" rel="noreferrer"><span>{item.title.split('/')[0]} /</span><h3>{item.title.split('/').slice(1).join('/')} <ArrowUpRight size={18}/></h3></a><p>{item.description || '这个项目暂未提供描述，前往 GitHub 查看更多。'}</p><TranslatedText translation={translation} field="description"/><TranslationControl translation={translation}/><div className="repo-metrics"><span><i style={{ background: ({ Python: '#d7b650', TypeScript: '#5184b5', JavaScript: '#cebd49', Rust: '#bd785e', Go: '#52a7b3' })[item.metrics.language] || '#7e9188' }}/>{item.metrics.language}</span><span><Star size={13}/>{fmt(item.metrics.stars)}</span><span className="gained"><Flame size={13}/>+{fmt(item.metrics.gained)}</span></div></article>;
}
function RepoPreview({ item }) {
  const translation = useTranslation(item);
  return <article className={`mini-repo ${translation.visible ? 'translation-open' : ''}`}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}<ArrowUpRight size={13}/></strong></a><p>{item.description}</p><TranslatedText translation={translation} field="description"/><TranslationControl translation={translation}/><span><Star size={12}/> {fmt(item.metrics.stars)} <b>+{fmt(item.metrics.gained)} 今日</b></span></article>;
}

function App() {
  const [page, setPage] = useState(() => { const p = location.hash.slice(1); return pages.some(x => x[0] === p) ? p : 'overview'; });
  const [status, setStatus] = useState(null), [items, setItems] = useState([]), [news, setNews] = useState([]), [skills, setSkills] = useState([]), [repos, setRepos] = useState([]);
  const [query, setQuery] = useState(''), [category, setCategory] = useState('all'), [date, setDate] = useState(''), [period, setPeriod] = useState(() => location.hash === '#repos' ? 'daily' : 'all-time');
  const [source, setSource] = useState('all'), [language, setLanguage] = useState('all'), [sort, setSort] = useState('rank'), [loading, setLoading] = useState(true), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [searchTerm, setSearchTerm] = useState(''), [savedCount, setSavedCount] = useState(0), [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef(null), requestVersion = useRef(0), mounted = useRef(true);
  const navigate = useCallback(p => { location.hash = p; setPage(p); setCategory('all'); setQuery(''); setSearchTerm(''); setSource('all'); setLanguage('all'); setSort('rank'); setPeriod(p === 'repos' ? 'daily' : 'all-time'); window.scrollTo({ top: 0 }); }, []);
  useEffect(() => { const handler = () => { const p = location.hash.slice(1); if (pages.some(x => x[0] === p)) { setPage(p); setPeriod(p === 'repos' ? 'daily' : 'all-time'); } }; window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler); }, []);
  useEffect(() => { const timer = setTimeout(() => setQuery(searchTerm), 250); return () => clearTimeout(timer); }, [searchTerm]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const handler = e => { if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus(); } if (e.key === 'Escape') { setShowHelp(false); searchRef.current?.blur(); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  const refresh = useCallback(async (quiet = false) => {
    const version = ++requestVersion.current;
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ kind: ['overview', 'sources'].includes(page) ? 'news' : page, category, q: query, source, language, sort });
      if (date) params.set('date', date);
      if (page === 'skills' || page === 'repos') params.set('period', period);
      const shared = date ? `&date=${date}` : '';
      const [nextStatus, current, topSkills, topRepos, saved] = await Promise.all([
        api('status'), api(`items?${params}`),
        page === 'overview' ? api(`items?kind=skills&period=all-time${shared}`) : Promise.resolve(null),
        page === 'overview' ? api(`items?kind=repos&period=daily${shared}`) : Promise.resolve(null), api('items?kind=saved'),
      ]);
      if (!mounted.current || version !== requestVersion.current) return;
      setStatus(nextStatus); setItems(current.items); setSavedCount(saved.total);
      if (page === 'overview') { setNews(current.items); setSkills(topSkills.items); setRepos(topRepos.items); }
      setError('');
    } catch (e) { if (version === requestVersion.current) setError(e.message); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [page, category, query, source, language, sort, date, period]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const timer = setInterval(() => refresh(true), status?.progress.running ? 2000 : 30000); return () => clearInterval(timer); }, [refresh, status?.progress.running]);
  useEffect(() => () => { mounted.current = false; }, []);
  async function collect() {
    try { await api('collect', { method: 'POST', body: JSON.stringify({ kind: ['news', 'skills', 'repos'].includes(page) ? page : undefined }) }); setToast('开始更新，新的内容会自动出现在这里'); await refresh(true); }
    catch (e) { setToast(e.message); }
  }
  async function save(item) {
    try { await api(item.saved ? `bookmarks/${item.id}` : 'bookmarks', { method: item.saved ? 'DELETE' : 'POST', ...(item.saved ? {} : { body: JSON.stringify({ id: item.id }) }) }); setToast(item.saved ? '已取消收藏' : '已加入收藏，稍后慢慢读'); await refresh(true); }
    catch (e) { setToast(e.message); }
  }
  async function copy(text) { try { await navigator.clipboard.writeText(text); setToast('安装命令已复制'); } catch { setToast('复制失败，可在详情链接中查看安装方法'); } }
  const healthy = status?.sources.filter(x => x.state?.status === 'ok').length || 0;
  const failed = status?.sources.filter(x => x.state?.status === 'error').length || 0;
  const lastUpdate = status?.sources.map(x => x.state?.success_at).filter(Boolean).sort().at(-1);
  const currentPage = pages.find(x => x[0] === page);
  const title = { overview: '在这里，望见世界。', news: '世界，正在发生。', skills: '好工具，值得被发现。', repos: '下一次灵感，从开源开始。', saved: '留给未来的自己。', sources: '每一条信息，都有来处。' }[page];
  const subtitle = { overview: '全球新闻、实用技能与开源趋势。每天，给好奇心一个新的起点。', news: '跨越地域与信息边界，从多个视角了解今天的世界。', skills: '从 Agent 生态中发现趁手的技能，让想法更快落地。', repos: '追踪 GitHub Trending，发现开发者正在关注的项目。', saved: '把值得阅读、尝试与探索的内容，收进自己的灵感库。', sources: '公开 RSS 与原始榜单直连；采集成功与失败，清晰可见。' }[page];
  const shownSources = status?.sources.filter(s => page === 'skills' ? s.kind === 'skills' : page === 'repos' ? s.kind === 'repos' : page === 'news' ? s.kind === 'news' : true) || [];
  const staleCount = items.filter(i => status?.today && i.snapshotDate !== status.today).length;
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#overview" onClick={e => { e.preventDefault(); navigate('overview'); }}><span className="brand-symbol"><Telescope size={24}/></span><span><strong>望远镜<span className="brand-dot">.</span></strong><small>DAILY WORLD</small></span></a><div className="sidebar-caption">你的每日探索站</div><nav aria-label="主导航">{pages.map(([id, label, Icon], i) => <React.Fragment key={id}>{i === 4 && <div className="nav-divider"/>}<button className={`nav-link ${page === id ? 'active' : ''}`} onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}><Icon size={18}/><span>{label}</span>{id === 'saved' && savedCount > 0 ? <b className="nav-count">{savedCount}</b> : id === page ? <span className="active-dot"/> : null}</button></React.Fragment>)}</nav><div className="sidebar-bottom"><div className="curiosity"><span>STAY CURIOUS</span><div className="little-orbit"><Globe2 size={45}/><span>✦</span></div><p>世界很大，<br/>每天多看一点。</p></div><button className="help-link" onClick={() => setShowHelp(true)}><CircleHelp size={16}/> 关于这个探索站 <ArrowUpRight size={14}/></button><div className="sidebar-version"><span className="live-dot"/> 个人阅读空间 <span>v1.0</span></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">探索站 <span>/</span> <strong>{currentPage[1]}</strong></div><div className="topbar-right"><span className="edition">独立视角 · 保持好奇</span><span className="avatar">望</span></div></header>
    <main><div className="eyebrow"><span className="live-dot"/>{status?.today || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())}<span className="eyebrow-divider"/> THE DAILY EDITION</div><div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div><button className="refresh-button" onClick={collect} disabled={status?.progress.running}><RefreshCw size={15} className={status?.progress.running ? 'spin' : ''}/>{status?.progress.running ? `更新中 ${status.progress.completed}/${status.progress.total}` : '更新内容'}</button></div>
    <div className="content-navigation"><div className="section-tabs">{[['overview', '今日精选'], ['news', '全球新闻'], ['skills', 'Skill 热榜'], ['repos', '开源热榜']].map(([id, text]) => <button key={id} onClick={() => navigate(id)} className={page === id ? 'selected' : ''}>{text}{id === 'skills' && <span className="new-mark">NEW</span>}</button>)}</div><a className="export-button" href={`/api/export${date ? `?date=${date}` : ''}`} download><ArrowDownToLine size={15}/><span>导出快照</span></a></div>
    {error && <div className="error-banner" role="alert">连接暂时出现问题：{error}<button onClick={() => refresh()}>重试</button></div>}
    {status?.progress.running && <div className="collect-notice"><span className="live-dot"/><span>正在收集今天的世界 · {status.progress.current || '准备中'}<small>内容会陆续更新，你可以继续浏览</small></span><progress value={status.progress.completed} max={status.progress.total}/></div>}
    {page !== 'sources' && <div className="filter-toolbar"><label className="search-field"><Search size={17}/><input ref={searchRef} aria-label="搜索内容" placeholder={page === 'skills' ? '搜索技能、作者…' : page === 'repos' ? '搜索项目、语言…' : '搜索你感兴趣的内容…'} value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>{searchTerm ? <button aria-label="清空搜索" onClick={() => setSearchTerm('')}><X size={14}/></button> : <kbd>/</kbd>}</label><div className="filter-controls">{page !== 'saved' && <label className="select-field"><span className="sr-only">快照日期</span><select aria-label="快照日期" value={date} onChange={e => setDate(e.target.value)}><option value="">最新快照</option>{status?.dates.map(d => <option key={d} value={d}>{d}</option>)}</select><ChevronDown size={13}/></label>}{['news', 'overview'].includes(page) && <label className="select-field"><select aria-label="语言" value={language} onChange={e => setLanguage(e.target.value)}><option value="all">全部语言</option><option value="zh">中文</option><option value="en">English</option></select><ChevronDown size={13}/></label>}{['skills', 'repos'].includes(page) && <label className="select-field"><select aria-label="排序" value={sort} onChange={e => setSort(e.target.value)}><option value="rank">原榜排名</option><option value={page === 'skills' ? 'installs' : 'stars'}>{page === 'skills' ? '安装量优先' : 'Star 数优先'}</option></select><SlidersHorizontal size={13}/></label>}</div></div>}
    {['overview', 'news'].includes(page) && <div className="category-tabs" aria-label="新闻分类">{status?.categories.map(c => <button key={c.id} className={category === c.id ? 'active' : ''} onClick={() => setCategory(c.id)}>{c.label}</button>)}</div>}
    {page === 'overview' && <>
      {!query && category === 'all' && <section className="hero"><div className="hero-copy"><div className="hero-kicker"><span>THE BIG PICTURE</span><span>每日视野 <ArrowUpRight size={13}/></span></div><h2>信息很多，<br/>让视野更<span>开阔。</span></h2><p>从全球发生的事，到值得探索的工具。<br/>在信息洪流中，找到你在意的那一束光。</p><button onClick={() => navigate('news')}>开启今日阅读 <ArrowRight size={17}/></button><div className="hero-footnote">原始来源直连 <span>·</span> 每日归档 <span>·</span> 为好奇心而生</div></div><div className="hero-globe"><div className="globe-top"><span className="live-dot"/> WORLD IN VIEW <span>LOCAL EDITION</span></div><GlobeArt/><div className="globe-bottom"><span>连接世界的每一个角落</span><ArrowUpRight size={17}/></div></div></section>}
      <div className="overview-grid"><section><div className="section-title"><h2><span className="title-square"/> 今日资讯 <span className="section-number">{news.length}</span></h2><button onClick={() => navigate('news')}>浏览全部 <ArrowRight size={14}/></button></div><div className="news-grid">{news.slice(0, 8).map((item, index) => <NewsCard key={item.id} item={item} onSave={save} index={index}/>)}</div>{!news.length && <Empty title={status?.progress.running ? '正在打开今天的世界' : '暂时没有匹配的资讯'}>{status?.progress.running ? '采集正在进行中，首批新闻即将出现在这里。' : '尝试切换分类、清空搜索，或点击更新内容。'}</Empty>}<button className="more-news" onClick={() => navigate('news')}>继续探索全球新闻 <ArrowDownToLine size={15}/></button></section>
      <aside className="discovery-column"><section className="mini-board"><div className="section-title"><h2><Sparkles size={17}/> Skill 雷达</h2><button onClick={() => navigate('skills')} aria-label="查看 Skill 热榜"><ArrowUpRight size={17}/></button></div><p className="mini-caption">让 Agent 更懂你的好技能</p>{skills.slice(0, 5).map((item, i) => <a key={item.id} className="mini-row" href={item.url} target="_blank" rel="noreferrer"><span className={`rank ${i < 3 ? 'top' : ''}`}>{String(item.rank).padStart(2, '0')}</span><span className="mini-info"><strong>{item.title}</strong><small>{item.metrics.owner}</small></span><span className="mini-value">{fmt(item.metrics.installs)}<small>安装</small></span></a>)}{!skills.length && <p className="board-empty">{status?.progress.running ? '正在获取 Skill 榜单…' : '暂无榜单，点击更新重试'}</p>}<button className="board-bottom" onClick={() => navigate('skills')}>发现更多技能 <ArrowRight size={14}/></button></section>
      <section className="mini-board repo-mini"><div className="section-title"><h2><Github size={17}/> 开源风向</h2><button onClick={() => navigate('repos')} aria-label="查看开源热榜"><ArrowUpRight size={17}/></button></div><p className="mini-caption">开发者们的今日关注</p>{repos.slice(0, 3).map(item => <RepoPreview key={item.id} item={item}/>)}{!repos.length && <div className="source-unavailable"><Wifi size={22}/><strong>{status?.progress.running ? '正在连接 GitHub' : '等待开源榜单'}</strong><p>{status?.sources.find(s => s.id === 'github-daily')?.state?.error || '从原始榜单获取公开排名，不填入示例数据。'}</p><a href="https://github.com/trending" target="_blank" rel="noreferrer">访问原始榜单 <ExternalLink size={12}/></a></div>}<button className="board-bottom" onClick={() => navigate('repos')}>探索开源项目 <ArrowRight size={14}/></button></section><section className="source-note"><span className="live-dot"/><div><strong>好信息，从好来源开始</strong><p>{healthy} 个来源已连接{failed > 0 ? ` · ${failed} 个暂不可用` : ''}</p><button onClick={() => navigate('sources')}>查看数据来源 <ArrowUpRight size={12}/></button></div></section></aside></div>
    </>}
    {page === 'news' && <><div className="list-summary"><span>{loading ? '正在加载…' : `${items.length} 篇资讯`}{staleCount > 0 && <small> · {staleCount} 篇来自历史缓存</small>}</span><label className="select-field"><select aria-label="新闻来源" value={source} onChange={e => setSource(e.target.value)}><option value="all">所有来源</option>{shownSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown size={13}/></label></div><div className="news-grid full-grid">{items.map((item, i) => <NewsCard key={item.id} item={item} index={i} onSave={save}/>)}</div>{!items.length && <Empty title={loading || status?.progress.running ? '新闻正在路上' : '没有找到相关资讯'}>{loading || status?.progress.running ? '正在获取公开来源，请稍候。' : '试试其他分类或关键词；也可以前往数据源查看采集状态。'}</Empty>}</>}
    {['skills', 'repos'].includes(page) && <><div className="ranking-intro"><div className="period-tabs">{(page === 'skills' ? [['all-time', '累计热榜'], ['trending', '24h 趋势'], ['hot', '热门增长']] : [['daily', '今日'], ['weekly', '本周'], ['monthly', '本月']]).map(([id, label]) => <button key={id} className={period === id ? 'active' : ''} onClick={() => setPeriod(id)}>{label}</button>)}</div><span><span className="live-dot"/>{page === 'skills' ? '来源 Skills.sh' : '来源 GitHub Trending'}<a href={status?.sources.find(s => s.kind === page && s.period === period)?.url || '#'} target="_blank" rel="noreferrer" aria-label="查看原始榜单"><ExternalLink size={13}/></a></span></div><div className="ranking-description">{page === 'skills' ? '保留来源榜单排名。累计榜显示总安装量；趋势和增长榜的数值以来源对应口径为准。' : `原站${{ daily: '今日', weekly: '本周', monthly: '本月' }[period]}趋势排名，新增 Star 为该时间段内的增长。`} <span>共 {items.length} 项{staleCount > 0 ? ' · 含历史缓存' : ''}</span></div>
      {page === 'skills' ? <div className="skills-table"><div className="skill-table-head"><span>#</span><span>技能 / 作者</span><span>8 周安装趋势</span><span>{period === 'all-time' ? '累计安装' : '榜单指标'}</span><span>操作</span></div>{items.map(item => <article className="skill-row" key={item.id}><span className={`rank ${item.rank <= 3 ? 'top' : ''}`}>{String(item.rank).padStart(2, '0')}</span><div className="skill-name"><a href={item.url} target="_blank" rel="noreferrer">{item.title}{item.metrics.official && <span className="official" title="来源标记为官方"><Check size={10}/></span>}<ArrowUpRight size={13}/></a><span>{item.metrics.owner}</span></div><Sparkline values={item.metrics.weeklyInstalls}/><strong className="install-count">{fmt(item.metrics.installs)}</strong><div className="row-actions">{item.metrics.installCommand ? <button className="icon-button" aria-label={`复制 ${item.title} 安装命令`} title="复制安装命令" onClick={() => copy(item.metrics.installCommand)}><Copy size={15}/></button> : <a className="icon-button" href={item.url} target="_blank" rel="noreferrer" aria-label={`查看 ${item.title} 安装方法`} title="查看安装方法"><ExternalLink size={15}/></a>}<SaveButton item={item} onSave={save}/></div></article>)}</div> : <div className="repo-grid">{items.map(item => <RepoCard key={item.id} item={item} onSave={save}/>)}</div>}
      {!items.length && <Empty title={loading || status?.progress.running ? '正在连接原始榜单' : '这份榜单暂时没有内容'}>{query ? '试试其他关键词，或清空搜索。' : '点击更新重试；若来源连接失败，可在数据源页面查看详情。已有的历史快照会被保留。'}</Empty>}
    </>}
    {page === 'saved' && <><div className="saved-header"><span>{items.length} 个值得再看的发现</span><span>收藏保存在本地，跨刷新保留</span></div><div className="news-grid full-grid">{items.map(item => <NewsCard key={item.id} item={item} onSave={save}/>)}</div>{!items.length && <Empty icon={Bookmark} title={query ? '没有找到匹配的收藏' : '让好发现，有个落脚处'}>点击新闻、Skill 或开源项目上的收藏图标，就能在这里再次找到它。</Empty>}</>}
    {page === 'sources' && <><div className="source-stats"><div><span>接入来源</span><strong>{status?.sources.length || '—'}<small>个</small></strong></div><div><span>最近连接成功</span><strong className="good">{healthy}<small>个</small></strong></div><div><span>暂时不可用</span><strong className={failed ? 'warning-text' : ''}>{failed}<small>个</small></strong></div><div><span>自动采集时间</span><strong className="schedule-value">{status?.schedule === '0 8 * * *' ? '每日 08:00' : status?.schedule || '—'}</strong><small>{status?.timezone} · 服务运行时生效</small></div></div><div className="source-list">{status?.sources.map(s => <article className="source-row" key={s.id}><span className={`source-type ${s.kind}`}>{s.kind === 'news' ? <Newspaper size={18}/> : s.kind === 'skills' ? <Sparkles size={18}/> : <Github size={18}/>}</span><div className="source-detail"><a href={s.url} target="_blank" rel="noreferrer">{s.name}<ArrowUpRight size={13}/></a><small>{s.kind === 'news' ? 'RSS 订阅' : '公开榜单'} · {categoryNames[s.category] || s.period}</small>{s.state?.error && <p className="source-error">{s.state.error}</p>}</div><div className="source-time"><span>{s.state?.success_at ? dateLabel(s.state.success_at, true) : '尚未成功采集'}</span><small>{s.state?.count || 0} 条内容{s.state?.attempted_at && ` · 最近尝试 ${dateLabel(s.state.attempted_at, true)}`}</small></div><span className={`status-pill ${s.state?.status || 'pending'}`}><i/>{s.state?.status === 'ok' ? '正常' : s.state?.status === 'error' ? '连接失败' : '等待采集'}</span></article>)}</div><div className="provenance"><Layers3 size={22}/><div><h3>为每一天留下真实快照</h3><p>新闻提供标题、来源摘要与原文链接。榜单保留原始排名和指标，不额外虚构热度。连接失败时保留最近一次成功内容，历史日期按北京时间归档。</p><p>每天的定时任务需要本服务持续运行。重新启动时会补做当日采集；更早停机日期不会被伪造或回填。</p></div></div>{status?.runs.length > 0 && <section className="run-section"><h2>最近采集记录</h2>{status.runs.slice(0, 6).map(r => <div className="run-row" key={r.id}><span>{dateLabel(r.started_at, true)}</span><span>{{ startup: '启动补采', manual: '手动更新', scheduled: '定时采集', cli: '命令行采集' }[r.reason] || r.reason}</span><span>{r.finished_at ? `${r.successful} 成功 / ${r.failed} 失败` : '进行中'}</span></div>)}</section>}</>}
    <footer className="page-footer"><span><Telescope size={14}/> 望远镜 · 保持好奇，独立思考。</span><button onClick={() => navigate('sources')}><span className="live-dot"/>{lastUpdate ? `最近采集 ${dateLabel(lastUpdate, true)}` : '等待首次采集'}<ArrowUpRight size={12}/></button></footer>
    </main></div>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {showHelp && <div className="modal-overlay" onClick={() => setShowHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-label="关于望远镜" onClick={e => e.stopPropagation()}><button className="icon-button modal-close" aria-label="关闭" onClick={() => setShowHelp(false)} autoFocus><X size={20}/></button><Telescope size={34}/><h2>给好奇心，一个探索站。</h2><p>望远镜聚合公开新闻 RSS、Skills.sh 和 GitHub Trending。无需模型或付费搜索 Key，即可浏览原始资讯。</p><p>每天北京时间 08:00 自动采集，需要服务持续运行。Skill 热榜供发现与参考，复制命令后可自行检查并安装。</p><p>外文新闻和项目描述可点击“译为中文”，在原文下方查看、隐藏或再次显示译文。机器翻译结果会保存在本地。收藏与每日快照存储在项目的本地 SQLite 数据库中。</p><button className="refresh-button" onClick={() => { setShowHelp(false); navigate('sources'); }}>查看全部来源 <ArrowRight size={15}/></button></section></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
