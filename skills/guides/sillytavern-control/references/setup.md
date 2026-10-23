# 接入与定位

## 依赖

本技能是 Hermes 指令文件，需要另行配置可运行的 `st-mcp`；不捆绑 Node.js、MCP 服务或 SillyTavern。当前联调版本为 `st-mcp` 0.12.0。按所用 MCP 的实际发行说明安装依赖并构建，不编造仓库地址或把本机开发目录当成用户安装路径。

Hermes 的 MCP 配置需要指定 Node 可执行文件、构建后的 `dist/server.js`，以及以下环境变量。它们属于 MCP 进程配置，不写进聊天内容或角色卡。

| 变量 | 必须对应的实际对象 |
| --- | --- |
| `ST_MCP_BASE_URL` | 目标原版酒馆 HTTP 地址，不是公开分享页或另一实例 |
| `ST_MCP_ST_ROOT` | 该实例的 SillyTavern 源码／程序根目录 |
| `ST_MCP_PROJECT_ROOT` | 对应该部署的项目根目录；原版独立部署可与 ST 根目录相同 |
| `ST_MCP_CONFIG_PATH` | 目标服务实际使用的 config.yaml |
| `ST_MCP_USER_DATA_ROOT` | HTTP 当前用户对应的数据目录；不是笼统的数据父目录 |
| `ST_MCP_SNAPSHOT_ROOT` | 该实例专用、可写且受保护的快照目录 |

显式配置这些值。0.12.0 带有开发环境默认路径，不能依赖默认值自动找到原版酒馆。MCP 需要从所在机器访问 HTTP 和这些文件路径；跨机器部署必须有实际对应的连接与存储方案，不能只改 HTTP 地址。

服务启停命令是可选项：`ST_MCP_RUNTIME_STATUS_CMD`、`ST_MCP_RUNTIME_START_CMD`、`ST_MCP_RUNTIME_STOP_CMD`、`ST_MCP_RUNTIME_RESTART_CMD`。没有配置就说明不能经本工具启停，不猜系统命令。

## 首次核对

1. 在当前工具目录确认 `st.doctor`、`st.config_locations` 和所需领域工具存在。
2. 调用 `st.doctor`，分别检查 CSRF、设置和扩展接口，不只看汇总的 `ok`。
3. 调用 `st.config_locations`，对照实际服务配置核对数据目录与用户。多用户登录或代理认证不能由目录存在来推断。
4. 列出目标角色或世界书，核对用户指定对象；不自动选择第一项。

遇认证、权限或网络问题，报告失败环节与最小缺口，不关闭认证、不改绑定、不切换到另一用户来绕过。默认 HTTP 客户端处理 CSRF 与会话 Cookie，不因此承诺自动完成任意登录认证。

## 生效层次

工具可发现 → HTTP 可用 → 对象读写成功 → 页面刷新后采用 → 实际生成或插件运行成功，是分别核验的结果。页面操作还需要[运行桥](ui.md)，后台语义工具不统一要求打开页面。
