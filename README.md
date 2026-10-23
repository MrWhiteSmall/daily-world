# 望远镜 · Daily World

一个本地运行的每日全球信息探索站：全球新闻、Agent Skill 热榜、开源项目热榜。

## 启动

需要 Node.js **22.16+**（使用内置 SQLite；推荐 Node 24/26）。

```bash
cd /Users/lsj/Documents/Code/daily-world
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:48931 。首次启动会在后台采集，内容陆续出现。若数据来源暂时无法连接，数据源页会显示失败原因，绝不填充假榜单。

开发时运行 `NODE_ENV=development npm run dev`，Express 内嵌 Vite，前后端同端口。

## 已实现

- 八大新闻分类：全球、科技、AI、商业、科学、健康、气候、文化体育。
- 13 个公开 RSS 来源，原始标题与来源摘要、发布时间、跳转原文。
- Skills.sh：累计安装榜、24h 趋势榜、热门增长榜，各取前 300 项。保留来源排名、指标、8 周趋势（来源提供时）；GitHub 托管的技能可复制安装命令，网站托管技能跳转原站查看安装方法。
- GitHub Trending：每日、每周、每月榜；语言、总 Star、时间段新增 Star。
- 搜索、语言/新闻来源/分类筛选、收藏、每日快照、JSON 导出。
- 中文标题、描述与译文统一显示为简体，使用 OpenCC 本地转换，无需模型调用或额外费用；已有快照、收藏和译文缓存同样生效，搜索支持繁简关键词。数据库保留采集原文，项目名、Skill 标识与链接保持原样。
- 外文新闻与开源项目可逐条“译为中文”，在原文标题和段落下展示对应中文，可隐藏/再次显示。默认隐藏，点击后才请求翻译，结果缓存在 SQLite；相同内容合并请求，最多同时翻译三个条目。
- 来源健康状态、失败原因、最近成功时间、采集记录。
- 每日 **北京时间 08:00** 定时采集，启动时补做当日任务；最多四个来源并发、每次请求 18 秒超时、网络错误或 5xx 自动重试一次、5MB 响应上限、进程内防止重复任务。
- SQLite WAL 持久化。采集失败保留成功快照；同一来源同一天更新，历史日期保留。
- 响应式中文阅读界面，桌面与手机均可使用。

## 采集与配置

```bash
npm run collect             # 所有来源
npm run collect -- news     # 只采集新闻
npm run collect -- skills   # 只采集技能榜
npm run collect -- repos    # 只采集开源榜
npm run check               # 核心测试与生产构建
```

环境变量通过 shell 或进程管理器设置（不自动读取 `.env`）：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `PORT` | `48931` | HTTP 端口 |
| `HOST` | `127.0.0.1` | 监听地址，默认仅本机 |
| `TZ_NAME` | `Asia/Shanghai` | 归档与定时任务时区；界面展示以北京时间为准 |
| `COLLECT_CRON` | `0 8 * * *` | 定时采集时间 |
| `DB_PATH` | `data/daily-world.sqlite` | 数据库文件 |
| `AUTO_COLLECT` | `true` | 设为 `false` 禁用启动补采（不影响每日定时任务） |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | 系统环境值 | 通过 Undici 标准代理支持连接外网 |
| `DASHSCOPE_API_KEY` / `DASHSCOPE_KEY` | 已有环境变量 | 按需中文翻译的百炼凭证，仅后端使用 |
| `TRANSLATION_MODEL` | `qwen-mt-flash` | 专用翻译模型 |
| `TRANSLATION_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 百炼兼容接口地址，可替换为对应地域/工作空间地址 |

来源配置：`server/config.js`。添加 RSS 只需新增一行；网页榜单解析位于 `server/parsers.js`。

**每天自动采集需要服务持续运行，电脑休眠或服务停止期间不会执行。** 重启会补做当日采集，不会伪造停机日期的历史数据。若要全天运行，可用常驻服务器与进程管理器运行 `npm start`，或由系统任务定期执行 `npm run collect`。当前尚未安装系统级开机服务或部署至公网。

这是个人本地阅读工具，没有多用户鉴权。收藏属于本地数据库中的统一个人空间。备份时停服务后备份 `data/`；运行期间使用 SQLite backup 工具，勿只复制正在写入的主数据库而遗漏 WAL。

## 来源与指标

BBC / BBC 中文 / DW / The Guardian / Nature / TechCrunch 的公开 RSS；[Skills.sh](https://skills.sh/) 的公开榜单；[GitHub Trending](https://github.com/trending) 的公开趋势页。

新闻不抓取付费全文，也不自动生成 AI 摘要。当前主要为英文信息，另提供 BBC 中文来源；点击“译为中文”后翻译该条新闻的标题/来源摘要或项目介绍，中文显示在对应原文下，项目名与 Skill 标识保持原样。使用百炼 Qwen-MT-Flash 机器翻译，按接口规则计费，隐藏/再次显示和缓存命中不重复调用。没有凭证、超时或限流时显示可重试的错误，不填充假译文。缓存键包含原文内容，内容变化会重新翻译。源站可能变更页面、限流、区域阻断或撤销 RSS；来源页会如实显示。榜单指标分别沿用原站口径：Skills 累计安装与趋势指标、GitHub 指定期间新增 Star 不能横向混算。GitHub 排名不是自建“综合热度”。按日期筛选的是**采集快照日期**，并非只显示当日发布的文章；RSS 本身可包含前几日文章。

新闻采集与榜单浏览无需模型或付费搜索 Key。逐条中文翻译使用已有环境中的百炼凭证，凭证不会发送到浏览器或写入项目源码。后续可接入搜索服务补充中文与区域新闻，或增加相似新闻聚类与个性化日报。

Skill 榜单供浏览与发现，复制命令不会在服务器自动执行任何安装。

## 技术结构

React + Vite / Express / node-cron / Node SQLite / rss-parser / Cheerio / Undici。使用成熟库解析 RSS、HTML、安排定时任务与处理代理，SQLite 使用参数化 SQL。

```text
server/config.js      来源、分类、时间表
server/parsers.js     RSS 与榜单解析（网页脚本仅作为 JSON 数据解析，不执行）
server/collector.js   有界并发采集与运行状态
server/translation.js 按需中文翻译、内容缓存与并发控制
server/store.js       每日快照、来源状态、收藏、运行记录
server/app.js         本地 HTTP API
server/index.js       服务入口、静态资源、启动补采、定时任务
src/main.jsx          阅读界面与交互
src/style.css         响应式视觉样式
tests/core.test.js    解析、失败保留、归档、并发、API 行为测试
```
