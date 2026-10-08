# 启动器接收端线上联调验收记录

验收日期：2026-10-01。最后健康检查：北京时间 19:23:26（11:23:26 UTC）。

以下为 2026-10-01 历史验收记录，原部署版本与迁移核验事实保留。当前 S2 部署和生产整次日志验收见文末“2026-10-05 S2 生产验收补充”。

结论：新版接收端的线上事件接收、鉴权查询、故障详情、错误分页和安装漏斗通过本次联调。已使用当前启动器源码的上报模块向真实生产接口发送合成事件，并通过 HTTP 查询与生产 D1 核对结果。此结论限于接收端与上报模块之间的链路，不代表三平台发布安装包的完整实机验收。

## 环境与执行范围

| 项目 | 核对结果 |
| --- | --- |
| 接口域名 | `https://noratavern.com` |
| Worker | `nora-landing`，部署列表最新版本 `e301aa8c-e16d-4bfc-afaf-77bd066d1639`，100% 流量 |
| 部署时间 | 2026-10-01 11:08:59 UTC |
| 数据库 | 既有 `DB` 绑定；生产迁移记录包含 0001–0007，0006 的技术字段及 0007 的 fault 列存在，无待应用迁移 |
| 接收端本地源码基线 | `162b6edec2ef72830f2148f3e957b4bc36f3863b` |
| 上报模块源码基线 | 启动器 main `aa5ec68`，使用 `launcher/desktop/telemetry.js` 与 `fault-packet.js` |

本次没有重新部署 Worker、修改密钥、执行结构迁移或替换用户启动器。线上部署版本与本地 Git commit 分别记录；本次核验了实际接口行为，没有从部署列表推断远端源码 commit。

最初本地 .dev.vars 中的读密钥返回 401；用户提供当前生产读密钥后，带鉴权查询返回 200。密钥只供验收进程使用，没有写入文档或仓库；临时凭据文件已删除。

## 线上验收结果

| 场景 | 实际结果 |
| --- | --- |
| 授权关闭 | 当日验收模块默认关闭详细诊断；失败和成功操作的阶段、耗时、状态照常发送，fault 全部为 null；上传确认后本地待发队列清空。新客户端后续改为新选择默认开启、保留已有主动关闭，此行仅记录历史验收 |
| 授权开启 | 合成故障的项目栈帧、cause 原因链、限定安装子进程错误输出、操作记录和环境信息成功入库，错误页与时间线读取内容一致 |
| 脱敏 | 合成原始路径替换为项目源码位置，合成密钥文本脱敏后发送；生产 fault 未保留这些原始合成字符串 |
| 中断恢复 | 用同一合成状态文件模拟重开，上报模块生成 interrupted 终结事件；线上最后状态与时间线可查 |
| 旧协议兼容 | v1/v2 事件均返回 202，且在生产 D1 中存在；未要求旧客户端提供 fault |
| 去重 | 同一事件再次提交返回接受确认，D1 仅保留一条记录 |
| 冲突与非法字段 | 同环境同序号不同 event_id 返回 identity_conflict；附加未知字段返回 invalid_event；均没有插入对应记录 |
| 安装标识 | 生产 D1 的 installation_id 为 64 位 HMAC，与发送的原始 UUID 不同 |
| 查询鉴权 | 常规查询、错误页、漏斗、操作时间线，无密钥及错误密钥均返回 401；正确密钥返回 200 |
| 常规查询与指纹 | 基础数量与测试事件一致；同一次失败的报错证据和终结证据保留两条错误，但指纹受影响操作数为 1，不重复计算为两个操作 |
| 错误跨页 | 独立合成版本共 103 条错误：第一页 100 条且 has_more=true；翻页前新增迟到事件，第二页完整返回剩余 2 条；保存空页游标后再新增 1 条，继续取到；event_id 无重复 |
| 聚合截断 | 上述数据的常规 errors 返回 100 条，errors_truncated=true；分页接口可读取其余记录 |
| 安装漏斗 | 新环境失败后重新安装成功，计为一个安装成功环境，历史失败尝试保留；存量环境不计入新增安装阶段 |
| 跨日期漏斗 | 合成环境昨天首次打开、今天完成安装，仅查询昨天首次打开批次也能取得后续三个阶段；就绪早于安装终结不漏计；批次仍标记 observing |
| 错误后恢复 | 当前上报模块在同一次操作中先报告错误再成功结束；fault 保留，operation_outcome=succeeded，最终失败数为 0，最后状态 succeeded |
| 网站统计 | 合成 download_ready 通过既有网站采集接口返回 202；常规统计与已有精简视图均能查询到有效请求，保持 schema_version=2 |
| 下载地址 | Windows、Mac Apple、Mac Intel 三个地址接口均返回 200；对应文件 HEAD 均返回 200，无文件内容下载 |
| 首页 | 返回 200，HTML 类型正常 |
| 参数校验 | 非法游标、错误视图与操作混用、漏斗携带游标、超过窗口范围等参数返回 400 |

另外重新执行接收端启动器与漏斗相关隔离测试：**13 项通过，0 项失败**。停收、限流、恶意故障包等相关逻辑采用隔离验证，本次没有在生产启用停收或压满限流。

## 测试数据清理与复验

测试前记录所有 event_id：146 个启动器测试 ID，其中 2 个被预期拒绝，144 条接受事件；另有 1 条网站有效下载请求。所有数据均为合成数据，使用独立的合成版本、标识和渠道。

清理仅对上述 event_id 执行定向删除，没有按日期、版本或整个表删除。生产 D1 随后核对：启动器测试 ID 剩余 0 条，网站测试 ID 剩余 0 条。

清理后再次从 HTTP 接口验证：各合成版本错误结果为空、合成漏斗首次打开数为 0、合成网站渠道有效请求为 0；带鉴权查询仍返回 200，未鉴权查询返回 401，首页返回 200。

## 验收证据

本机保留的证据只包含本次合成事件和测试范围的查询结果，不包含查询密钥或真实用户故障明细：

- [测试事件清单](/Users/sorrymakerx/Documents/Codex/2026-10-01/launcher-receiver-acceptance/manifest.json)
- [线上接收结果](/Users/sorrymakerx/Documents/Codex/2026-10-01/launcher-receiver-acceptance/ingest-results.json)
- [首次入库核对](/Users/sorrymakerx/Documents/Codex/2026-10-01/launcher-receiver-acceptance/db-rows.json)
- [鉴权查询、分页、漏斗与网站回归](/Users/sorrymakerx/Documents/Codex/2026-10-01/launcher-receiver-acceptance/query-results.json)
- [报错后成功恢复](/Users/sorrymakerx/Documents/Codex/2026-10-01/launcher-receiver-acceptance/recovery-results.json)
- [定向清理后的 D1 核对](/Users/sorrymakerx/Documents/Codex/2026-10-01/launcher-receiver-acceptance/cleanup-results.json)
- [清理后的接口健康检查](/Users/sorrymakerx/Documents/Codex/2026-10-01/launcher-receiver-acceptance/post-cleanup-health.json)

## 尚未覆盖的验收层级

本次跨平台字段为合成值，测试运行于当前 Mac 上的 Node.js，未使用 Windows、Mac Apple、Mac Intel 各自发布安装包执行完整安装与错误恢复。真实用户勾选授权的界面、真实安装子进程、启动进程身份及模型配置等工作流，需要随客户端发布按三平台实机记录；不能用本次接收端验收代替。

开发者实际定时取数程序也未在本次设置或运行。接口取数行为已通过验证，调用方仍须按 [技术对接文档](launcher-receiver-handoff.md) 保存结果与游标。

## 2026-10-05 S2 生产验收补充

当前接收端 Worker：`4165eaf3-1d9c-491b-983c-33706eb6c308`，100% 流量；回退版本 `a98c2a4e-0fe2-44ba-8bef-6c2654f00129`。上线前完成新鲜 D1 导出，在隔离 SQLite 恢复并通过完整性检查；随后仅应用 `0008_launcher_operation_logs.sql`，核对日志表和唯一终结索引后部署。首页内容与发布前一致，网站统计、启动器统计、错误分页、问题汇总及首次安装漏斗返回 200；无读密钥的查询返回 401。此前 S2 日志路由 404 和未应用 0008 的核验保留为历史证据。

2026-10-05 14:15–14:16（上海时间），启动器侧使用实际日志生产者和投递客户端，向生产 HTTP 接口发送独立合成操作；没有运行真实酒馆或改动真实安装。

| 项目 | 生产验收事实 |
| --- | --- |
| 整次失败日志 | 真实子进程产生 360 条限定输出、退出码 7 和调用栈；30 段日志分两页取回，486855 字节，与本地脱敏文本 SHA-256 一致，complete=true |
| 故障关联 | schema2 故障摘要接收成功；使用故障统计返回的同安装 HMAC、operation_id、log_id 可取回对应原始操作日志 |
| 丢确认去重 | 实际服务端接受后模拟丢 ACK；同一段发送 2 次，只存 1 份，chunk_id 与确认相符 |
| 断网及中断 | 离线重开后续传通过；异常中断后重开上传对应操作日志通过 |
| 上传边界 | 成功操作不上传整次日志；主动关闭详细诊断后只上传基础统计；合成存量批次未扩大新增安装漏斗 |
| 测试数据清理 | 启动器侧逐行核对自建身份与事件/操作/chunk ID 后，定向清理 19 条基础事件和 31 段日志；该身份两表剩余均为 0，真实用户数据未删除 |

当前结论：接收端与实际源码客户端的生产入库、查询和去重链路已验收。未推送 GitHub、未发布启动器、未轮换密钥；三平台发布包实机安装和真实用户故障修复不在本次验收结论内。

证据（本机受保护文件，不包含查询密钥；先前审计原件未改写）：

- [接收端部署、备份与兼容查询结果](/Users/sorrymakerx/.codex/worktrees/launcher-model-reconfigure/tavern/outputs/launcher-reliability-20261004/s2-production-receiver-result.json)
- [实际生产者及客户端生产验收](/Users/sorrymakerx/.codex/worktrees/launcher-model-reconfigure/tavern/outputs/launcher-reliability-20261004/s2-production-client-result.json)
- [自建测试数据定向清理核验](/Users/sorrymakerx/.codex/worktrees/launcher-model-reconfigure/tavern/outputs/launcher-reliability-20261004/s2-production-owned-records-cleanup.json)
- [清理后的生产只读行数核对](/Users/sorrymakerx/.codex/worktrees/launcher-model-reconfigure/tavern/outputs/launcher-reliability-20261004/s2-production-owned-rows-after.json)

回退仅切换 Worker 到已记录旧版本，保留新增日志表和发布后记录；不得用发布前数据库备份覆盖后来收到的真实事件。
