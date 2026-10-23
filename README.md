# 诺拉宣传页

诺拉酒馆介绍、开源启动器下载、本地 ClawChat 配对指引与云端部署入口。

使用 GitHub Pages 从 main 分支根目录发布。

本地开源下载优先展示，云端部署放在下方独立卡片。云端分享码在 `index.html` 的 `.cloud-deploy[data-agent-code]` 配置；`cloud.js` 用同一个码生成 ClawChat 唤起地址、网页备用地址与复制内容。分享页的静态链接和备用码也应同步更新，供脚本未加载时使用。

## 安装包下载入口

网页的三个稳定入口为 `#download-windows`、`#download-mac-arm64`、`#download-mac-x64`。它们通过 `https://noratavern.com/api/download/:platform` 自动定位安装包，页面不维护版本号。

版本定位优先读取产品同一份极狐 `channels/stable.json`，验证对应平台的正式安装包；失败时查询 GitHub `/releases/latest`，仅在该发布没有可用安装包时扫描小页历史，并保留 SourceForge 目录后备。文件传输优先极狐，然后尝试同标签、同文件名的 SourceForge 和 GitHub 文件；支持单段 Range。下载和统计存储解耦，不依赖用户浏览器访问 GitHub API。

发布遵循 `v主版本.次版本.修订号` 标签和 `Nora-Tavern-Launcher-版本-win-x64-setup.exe`、`-mac-arm64.dmg`、`-mac-x64.dmg` 命名。后续正式发布更新极狐稳定目录后，网页在缓存刷新时自动跟随，最长缓存 15 分钟。详见 [下载实现与验收](docs/downloads.md)。

## 自有统计 API

统计数据写入 Cloudflare D1，`GET /api/stats` 以 Bearer 密钥查询。详见 [统计接口文档](docs/analytics-api.md)。前端已改用自有接口，Umami 不再作为数据来源。

首次上线前必须填写 `wrangler.jsonc` 的真实 D1 database_id，初始化 migrations，并配置 `STATS_READ_KEY`、`VISITOR_HASH_SECRET` 两个运行时密钥。生产数据库已初始化，运行时密钥已部署。未来重新部署使用现有数据库与密钥，不要重新生成访客去重密钥。不要将 `.dev.vars` 或任何生产密钥加入仓库。

本地验证：`npm ci`、`npm test`、`npx wrangler d1 migrations apply DB --local`、`npm run dev`。本地密钥放在被忽略的 `.dev.vars`。浏览器统计只在正式域名启用，本地浏览不会污染数据。构建命令 `npm run build` 只把网页文件复制到 dist，API 和私有配置不会作为 Cloudflare 静态资源发布。


## 技能库

公开二级页为 `skills/`；首页导航和介绍下方均有入口。保留五项项目技能，另外托管两项独立扩展的完整 ZIP，说明与安装边界见 [技能安装指南](skills/INSTALL.md)。

目录数据为 `skills/catalogue.js`；页面与脚本位于同一目录。新增包必须核对大小、SHA256 及完整目录，并同步描述与安装说明，不给独立技能生成不存在的应用仓库路径。构建将整个 skills 目录复制到 dist/skills，使页面、说明、参考和压缩包一同发布。技能页面只提供浏览与下载，不执行技能，也未扩充原有安装包统计事件。

针对性检查：`npm run build` 后执行 `node --test tests/skills-library.test.mjs tests/analytics.test.mjs`。技能更新不要求发布诺拉酒馆应用新版本。
