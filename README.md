# 诺拉宣传页

诺拉酒馆介绍、开源启动器下载与本地 ClawChat 配对指引。

使用 GitHub Pages 从 main 分支根目录发布。

云端创建入口暂时移除；本地下载和配对功能保留。

## 安装包下载入口

本地下载由 `installers.js` 通过 GitHub Releases API 自动解析，不在页面维护版本号。三个稳定入口为 `#download-windows`、`#download-mac-arm64`、`#download-mac-x64`，项目 README 可长期使用。

优先使用最新正式发布中的三平台完整安装包；若最新发布只含组件更新，查找最近 100 条发布中的最新完整安装包。请求失败时明确提示并跳转 GitHub 发布页，不使用写死的旧安装包。

按现有 `v主版本.次版本.修订号` 正式标签及 `Nora-Tavern-Launcher-版本-win-x64-setup.exe`、`-mac-arm64.dmg`、`-mac-x64.dmg` 命名发布即可自动更新。若未来更改文件命名或发布规则，需要同步调整解析规则。

## 自有统计 API

统计数据写入 Cloudflare D1，`GET /api/stats` 以 Bearer 密钥查询。详见 [统计接口文档](docs/analytics-api.md)。前端已改用自有接口，Umami 不再作为数据来源。

首次上线前必须填写 `wrangler.jsonc` 的真实 D1 database_id，初始化 migrations，并配置 `STATS_READ_KEY`、`VISITOR_HASH_SECRET` 两个运行时密钥。生产数据库已初始化，运行时密钥已部署。未来重新部署使用现有数据库与密钥，不要重新生成访客去重密钥。不要将 `.dev.vars` 或任何生产密钥加入仓库。

本地验证：`npm ci`、`npm test`、`npx wrangler d1 migrations apply DB --local`、`npm run dev`。本地密钥放在被忽略的 `.dev.vars`。浏览器统计只在正式域名启用，本地浏览不会污染数据。构建命令 `npm run build` 只把网页文件复制到 dist，API 和私有配置不会作为 Cloudflare 静态资源发布。
