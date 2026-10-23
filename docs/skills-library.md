# 技能库上架（2026-10-23）

## 已授权结果与边界

用户在「启动器」会话 01a11ff8-b571-78c2-bde5-33485a02bcdf 明确要求与本会话联调，将两项独立技能放到 noratavern.com 的技能库。本次上架网站页面、安装说明与完整 ZIP；不修改诺拉酒馆应用、不发布应用版本。保留已确认的页面风格、首页两个入口、五项项目技能、安装包下载/云端/网盘入口与统计接收端。

验收：公开首页可进入 /skills/；七项技能数据及相关静态资源可访问；两份 ZIP 内容、大小与 SHA256 与作者交付一致；安装说明明确完整目录与当前实例；独立技能使用本站说明链接，不生成不存在的应用仓库路径。本次禁止 Computer Use，以源码、构建、针对性检查和 HTTP 验收，不宣称新的浏览器视觉验收或技能执行验收。

## 内容与维护

- 页面：skills/index.html；交互样式：skills/library.js、skills/library.css；唯一目录数据：skills/catalogue.js。
- 项目技能：保留 nora-cardforge、tavern、tavern-ops、tavern-updater、model-provider-config；来源核对提交 c65d44b3562b5fc918eb92c8bb8d1bb4482359d9。
- 独立技能：nora-persona-designer 0.1.2、sillytavern-control 0.1.0；来自 /Users/sorrymakerx/Desktop/诺拉技能库，原始 ZIP 不改写。
- 指南与包：skills/INSTALL.md、skills/guides/、skills/packages/，生产构建完整复制至 dist/skills。
- 人格技能只输出完整 SOUL.md，由用户复制更换；不自动覆盖活动人格。
- 原版酒馆技能需要 st-mcp，与内置 tavern 分开。只引用交接的 macOS + 原版 ST 1.18.0 + st-mcp 0.12.0 后台联调结果，页面桥/模型/第三方插件/MVU实际更新及其他平台未验。
- 技能页提供静态下载，未增加技能下载统计事件，也未混入原安装包统计。

## 校验数据

| 文件 | 字节 | SHA256 |
| --- | --- | --- |
| nora-persona-designer-0.1.2.zip | 8579 | 48b267b32a12ff4b5204f6e3e13c38da524d03471a9e54595dd62bf5959b3f07 |
| sillytavern-control-0.1.0.zip | 13405 | db682715ed0520f8d68e0df6c2ca0d1c8bfbcad8b67494dd8303447a8e9c6cd3 |

## 发布前验证

- 构建后执行 tests/skills-library.test.mjs 和 tests/analytics.test.mjs：通过。验证包字节、原五项保留、两个扩展边界、生产页面及引用路径和现有统计行为。
- ZIP 完整性、所有归档成员与公开说明目录逐字节一致；全部 Markdown 本地引用存在。
- 生产 Worker/settings/deployments/首页备份位于 /Users/sorrymakerx/Documents/Codex/2026-09-11/g-ti/outputs/skills-library-publish-20261023（不提交）。
- dry-run 的 Worker 脚本与实际生产备份一致，未修改后端、DB、下载源、统计脚本或运行时密钥。

发布及公开 HTTP 结果在本会话发布回执记录；有新发现时补充本文件。
