# 诺拉启动器诊断接收端技术对接文档

日期：2026-10-01。适用对象：接收端开发与运维、启动器发布人员、开发者取数程序维护者。

当前交接补充（2026-10-05）：S2 接收端已上线，生产 Worker 为 `4165eaf3-1d9c-491b-983c-33706eb6c308`，迁移 0008 已应用。真实日志生产者与客户端已通过生产 HTTP 整次日志入库、两页查询、断网重开、丢 ACK 去重、同安装 HMAC 关联故障查询及关闭边界验收；自建测试身份的 19 条基础事件和 31 段日志已由启动器侧定向清理，两表剩余均为 0，未删除真实用户数据。启动器未发布，三平台实机验收另行记录。S2 协议见 [接口说明](analytics-api.md)，证据与当前部署/回退状态见 [验收记录](launcher-receiver-acceptance.md)。下文 2026-10-01 基线及验收要求保留为历史依据，不能视作当前部署版本。

本次目标：用户无需手动提交日志，开发者能够查询启动器的操作阶段、耗时、运行结果，以及用户主动授权后的脱敏故障证据。交付以生产接口实际接收和查询成功为准。

## 1. 当前状态与交付范围

本次升级复用现有 Cloudflare Worker 和 D1 数据库。2026-10-01 已确认生产部署及迁移，接收、故障查询、分页和漏斗通过线上联调，见 [验收记录](launcher-receiver-acceptance.md)。后文保留协议、运维与验收要求，供接收端和取数程序维护人员交接。

| 项目 | 当前证据 | 本次需要完成 |
| --- | --- | --- |
| 基础事件接收 | 2026-10-01 生产 v1/v2/v3、入库及去重复验通过 | 接入发布后的真实客户端 |
| v3 脱敏故障包 | 生产新增字段、接收、鉴权故障及时间线查询验收通过 | 随客户端发布验收真实故障路径 |
| 错误连续分页 | 生产 103 条合成错误跨页、迟到补报、后续继续查询通过 | 取数程序正确保存结果和游标 |
| 首次安装漏斗 | 生产合成场景及跨日期查询验收通过 | 随真实客户端采集持续取数 |
| 新启动器 | 本地 main 已实现新上报规则 | 接收端验收后再做客户端发布与实机验证 |

接收端源码基线：`162b6edec2ef72830f2148f3e957b4bc36f3863b`；启动器源码基线：`aa5ec68`。交付其他版本时，必须核对协议文件及本次相关行为是否保留。线上部署版本单独记录在验收文档中，源码合并不能代替生产验收或客户端发布。

已确认的范围：

- 网站下载只要求统计有效请求成功，不新增文件传输完成检测。
- 基础阶段、耗时、状态和固定技术错误信息不受详细诊断开关控制；详细故障包须用户首次主动授权，之后后台自动上报。
- 开发者自行定时取数；不新增监控页面，不创建新的定时任务。
- 网站访客与启动器安装环境不做身份关联，不要求认定为同一个用户。
- 保留现有网站统计接口、数据、页面、安装包解析逻辑及既有定时刷新配置。

## 2. 系统组成与职责

```text
启动器：基础事件 / 获授权的脱敏故障包
        ↓ POST /api/launcher/events
既有 Worker：白名单校验、限流、HMAC、幂等接收
        ↓
既有 D1：launcher_events，与网站 events 分表
        ↑ GET /api/launcher/stats + 查询密钥
开发者取数程序：定时查询、完整翻页、保存证据、分析问题
```

| 参与方 | 必须负责的行为 |
| --- | --- |
| 启动器 | 授权状态、脱敏、限定故障输出、持久事件标识、断网重试；关闭详细诊断时仍发送基础事件，`fault=null` |
| 接收端 | 兼容 v1/v2/v3、校验大小和字段、拒收不合规内容、去重入库、保护查询接口、返回真实分页状态 |
| 取数程序 | 安全持有读密钥、处理失败与分页、落盘后保存游标、区分过程错误和最终失败，不把截断结果当全量 |
| 发布人员 | 备份、迁移、部署、验收、记录版本；接收端通过后再放行新启动器 |

接收端不替用户授权。当前协议没有独立授权证明字段，服务端只能校验事件及故障包的结构和内容；是否可以采集详细证据由启动器控制。公开采集接口也不能认证事件一定来自官方客户端或真实用户。

## 3. 配置与协议依据

| 配置项 | 要求 |
| --- | --- |
| Worker | 复用 `nora-landing`，入口 `server/worker.mjs` |
| D1 | 复用 `DB` 绑定及 `nora-landing-analytics`，迁移目录 `migrations` |
| `VISITOR_HASH_SECRET` | 保留原值；变化会改变网站及启动器统计标识，影响连续统计 |
| `STATS_READ_KEY` | 复用既有查询密钥，通过安全渠道交付取数人员；不进入客户端、网页或仓库 |
| `LAUNCHER_RATE_LIMITER` | 保留每 IP 每 60 秒 60 次请求限制；共享出口可能一起受限 |
| `LAUNCHER_TELEMETRY_PAUSED` | 仅在明确需要停收时设为字符串 `true`，正常接收时不启用 |
| 静态资源、网站限流、既有 cron | 保持 `wrangler.jsonc` 既有配置，不新增启动器监控任务 |

字段与枚举的唯一协议依据是 [server/launcher-contract.json](../server/launcher-contract.json)，应与启动器 `launcher/desktop/telemetry-contract.json` 保持一致。执行逻辑见 [server/launcher.mjs](../server/launcher.mjs)，鉴权与路由见 [server/worker.mjs](../server/worker.mjs)。完整查询说明见 [接口文档](analytics-api.md) 与 [漏斗口径](launcher-funnel.md)。

## 4. 事件接收接口

`POST https://noratavern.com/api/launcher/events`，`Content-Type: application/json`，请求体为 `{"events":[...]}`。采集不携带 `STATS_READ_KEY`，不要在客户端嵌入任何管理密钥。

### 4.1 字段与约束

| 字段组 | 规则 |
| --- | --- |
| 协议 | 新客户端 `schema_version=3`；接收端继续支持 v1/v2。查询响应的 `schema_version=1` 和故障包的 `schema=1` 是不同层级 |
| 事件身份 | `event_id`、`installation_id` 为 UUID v4；`sequence` 为安装环境内递增的正安全整数；重试保留原标识和序号 |
| 操作身份 | 任务事件带 UUID v4 `operation_id` 且 `action` 非 `none`；全局事件为空操作 ID、`action=none` |
| 时间 | `occurred_at` 为 Unix 毫秒，允许最近 7 天补报、最多未来 5 分钟；允许的未来时间入库截到接收时间 |
| 平台与版本 | 平台 `win32/darwin/linux`，架构 `x64/arm64`；版本为 `unknown` 或协议允许的版本字符串，不带前缀 `v` |
| 过程 | `event/action/stage/status/cohort/error_code` 必须使用协议枚举，不接受自由文本错误码 |
| 耗时 | `elapsed_ms` 最大 30 天；`stage_elapsed_ms` 不大于操作耗时；`progress_age_ms` 为 null 或不大于阶段耗时 |
| 技术错误 | v2/v3 的 `error_source/error_site/system_code/http_status/exit_code/exit_signal/error_kind/attempt`；失败必须有来源、位置、类型和至少一次尝试，非失败时保持空值或 0 |
| 故障包 | v3 必须带 `fault`，基础事件或未授权时为 null；非 null 只允许失败的 `launcher_error` 或 `operation_finished` |

重要限制：每批 1–20 条，客户端序列化请求预算为 **60,000 字节**；服务端读取请求体的硬上限为 **65,536 字节**，超限返回 413。单个 `fault` 最大 **24,576 字节**。未知字段拒收，不要附加 `test`、用户名、配置全文等自定义字段。

故障包固定包含 `schema/fingerprint/environment/errors/output/breadcrumbs/truncated`：

- `fingerprint` 为 64 位小写十六进制；环境仅包含操作系统版本、Node/Electron 版本和构建摘要。
- 最多 4 个错误，保留原因链关系；每个最多 12 个项目栈帧，消息最多 1,200 字符。
- 限定子进程错误输出最多 12 行，每行 500 字符；操作记录最多 16 项；截断必须标记 `truncated=true`。
- 启动器先脱敏；接收端再拒收检测到的原始路径、URL、认证串等不合规内容。白名单和规则校验不等于可以证明任意文本完全没有敏感信息。
- 不采集聊天、模型回复、密钥、配对码、配置全文或 Hermes 日常内部日志。

### 4.2 可生成请求体的故障示例

以下为合成测试数据，版本不代表发布版本；它只演示单条事件结构，不构成完整安装流程。使用 Node.js 生成请求体，时间与 UUID 在运行时生成；生成本身不会发送请求。

```javascript
const event = {
  schema_version: 3,
  event_id: crypto.randomUUID(), installation_id: crypto.randomUUID(),
  operation_id: crypto.randomUUID(), sequence: 1,
  event: 'operation_finished', occurred_at: Date.now(),
  platform: 'win32', arch: 'x64',
  launcher_version: 'unknown', product_version: 'unknown', cohort: 'existing',
  action: 'install', stage: 'runtime_extract', status: 'failed',
  error_code: 'unknown', elapsed_ms: 12000, stage_elapsed_ms: 10000,
  progress_age_ms: null,
  error_source: 'launcher', error_site: 'launcher.operation',
  system_code: '', http_status: null, exit_code: null, exit_signal: '',
  error_kind: 'TypeError', attempt: 1,
  fault: {
    schema: 1, fingerprint: 'a'.repeat(64), truncated: false,
    environment: {os_release: '10.0', node: 'unknown', electron: 'unknown', launcher_build: ''},
    errors: [{relation: 'error', kind: 'TypeError', message: 'Cannot read property of undefined',
      frames: ['at install (<source>/main.js:42:8)'], code: '', syscall: '', path: ''}],
    output: ['installer failed'],
    breadcrumbs: [{event: 'stage_started', stage: 'runtime_extract', status: 'running', elapsed_ms: 2000}]
  }
};
console.log(JSON.stringify({events: [event]}));
```

### 4.3 响应、幂等与重试

```json
{
  "accepted_event_ids": ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  "rejected_event_ids": [
    {"event_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","reason":"invalid_event"}
  ]
}
```

HTTP 202 必须按上述数组逐条确认，可以部分成功或全部拒绝。不能仅凭 202 就删除整批队列；非法事件 ID 无法回显，调用方也不能假定所有提交项都出现在数组中。

| 状态 | 处理 |
| --- | --- |
| 202 | 已接受及合法重复项列入 accepted；`invalid_event`、`identity_conflict` 为单条永久拒绝 |
| 400 | 请求体或批次数量不合法，修正后再提交 |
| 413 | 请求体超过服务端硬上限，缩小批次，不能原样无限重试 |
| 429 | 限流，遵守 `Retry-After: 60` 并退避 |
| 503 | 数据库、配置或服务异常；保留原事件身份重试，不当作接收成功 |
| 200 且 `paused=true` | 运维停收，返回 `retry_after_seconds=3600`；没有入库确认 |

数据库以 `event_id` 主键和 `(installation_id, sequence)` 唯一约束去重。重复成功请求不新增行，身份冲突不可覆盖既有行。批次不是整体事务，服务异常前可能已写入部分事件，原身份重试可安全去重。

当前客户端收到停收响应会清空待发队列并暂停约一小时，停收期间不保证事后补回。正常网络异常会退避重试，但本地队列有 7 天、500 条、约 1 MiB 的容量限制，不能承诺绝对无丢失。上传失败不得阻塞启动器主流程或递归生成上传错误故障包。

安装标识以 `HMAC(secret, "launcher:" + installation_id)` 入库，不保存原始安装 UUID；临时用于限流的 IP 不写入启动器事件表。查询返回的是 HMAC 标识，不能拿原始 UUID 当查询用的 installation_id。

## 5. 开发者查询接口

`GET https://noratavern.com/api/launcher/stats`。所有视图及操作时间线都要求 `Authorization: Bearer <STATS_READ_KEY>`，缺失或错误返回 401。密钥由取数程序从受保护环境加载；不写入 URL。

公共参数：`from/to=YYYY-MM-DD`，上海时区、包含起止日期、最多 93 天；可选 `platform/launcher_version/product_version`。接口不缓存。400 表示参数错误，503 表示服务不可用，都不能转换成零数据。

| 查询方式 | 用途与边界 |
| --- | --- |
| 不传 view | 汇总、失败分组、近期错误、指纹分组、阶段耗时、最后可见状态；errors/failures/issues 最多 100 项，current/operations 最多 200 项，必须检查对应 `*_truncated` |
| `view=errors&cursor=0` | 完整发现范围内的错误，每页最多 100 条，按入库 rowid 升序，返回 `errors/next_cursor/has_more` |
| `operation_id=<UUID>` | 该操作全部事件及 fault，每页 500 条，用 `next_offset`；可附查询返回的 HMAC installation_id；时间线不受日期和版本过滤，但日期参数仍必须合法 |
| `view=funnel&window_days=7` | 首次打开批次的安装漏斗，观察窗可选 1–30 天，具体口径见下一节 |

`view=errors` 不能同时传 `operation_id/installation_id/offset/window_days`；`view=funnel` 不能传操作筛选、offset 或 cursor。不要混用错误游标和时间线偏移量。

### 5.1 定时取故障的处理规则

1. 选定日期和筛选范围，从已保存 cursor 开始，首次为 0；建议查询范围覆盖最近 7 天补报，注意上海日期边界。
2. 将返回 errors 按 `event_id` 幂等保存到开发者自己的结果存储，再保存 `next_cursor`。二者尽量作为同一事务，或先持久化结果再写游标。
3. `has_more=true` 时继续翻页；false 时也保留 `next_cursor`，下次轮询从该位置继续；空页游标保持不变。
4. 日期范围或平台/版本筛选改变时，从 0 重读并按 event_id 去重。每日滚动日期范围也属于范围变化。数据库恢复、重建、VACUUM 等可能改变 rowid，维护后同样重置游标。
5. 发生时间较早但后来才送达的错误会取得更大的入库游标，可以继续发现；日期范围外的事件仍不会返回。
6. `operation_outcome` 是查询时的最终结果，可能为 null 或后来成功。终结事件到达不会自动重发已读错误，需要时再查询操作时间线刷新结果。

调用示例（日期仅为示例，密钥从环境变量读取）：

```bash
curl --fail-with-body --silent --show-error --get \
  'https://noratavern.com/api/launcher/stats' \
  --header "Authorization: Bearer ${NORA_STATS_READ_KEY}" \
  --data-urlencode 'from=2026-09-25' --data-urlencode 'to=2026-10-01' \
  --data-urlencode 'view=errors' --data-urlencode 'cursor=0'
```

一次错误可能在重试后恢复。`launcher_error` 的 failed 不等于操作最终失败；明确取消、中断、失败、等待用户、慢、疑似停滞、失去联系应分开解释。超过 2 分钟没有心跳只表示 `contact_lost`，不能直接认定进程崩溃。故障包缺失可能是未授权或采集、传输缺失；包内证据不完整还可能因为截断，不能据此推断没有错误。

## 6. 首次安装漏斗口径

`GET /api/launcher/stats?from=2026-09-25&to=2026-10-01&view=funnel&window_days=7`。

from/to 按首次打开日期选取 `cohort=new` 的安装环境；后续事件可跨日期，只要在该环境首次打开后的观察窗内。每个环境每阶段计一次：

| summary 字段 | 判定 |
| --- | --- |
| `first_opened` | 有首次打开记录 |
| `install_started` | 有安装操作开始记录 |
| `install_completed` | 同一个已开始的安装操作成功结束 |
| `runtime_ready` | 有安装完成证据且首次运行就绪 |

排除存量/未知环境、更新、修复；不将网站下载请求强行拼接到安装环境。网站有效请求与安装漏斗分别取数和观察趋势，不声称个人从下载到安装的完整转化。

输出含 `summary/stages/daily/observation/states/states_by_stage/durations/failures`。阶段转化分母为零返回 null，仍在观察中的批次不能当最终流失；迟到补报可能修订历史。失败后重试成功，历史失败尝试仍保留。漏斗耗时为已结束阶段的中位数/P90，与常规接口成功阶段的平均/最大耗时不同。

超过 50,000 条相关事件返回 422 `cohort_too_large`，应缩小日期或筛选平台，不返回截断漏斗。漏斗和错误分页本身不新增数据库迁移、不新增客户端事件。

## 7. 数据库迁移与发布步骤

以下为交接执行指令，本次文档编制没有执行远程迁移或发布。运行前必须得到生产操作授权，确认 Cloudflare 账号、数据库和路由属于目标环境。

### 7.1 迁移清单

| 文件 | 作用 |
| --- | --- |
| `0005_launcher_events.sql` | 启动器事件基础表和索引；历史记录显示已部署，仍须核对实际迁移记录 |
| `0006_launcher_error_details.sql` | 增加 8 个技术错误字段，旧事件有默认值或 null |
| `0007_launcher_fault_packets.sql` | 增加 nullable `fault TEXT`，存 JSON，旧事件保持 null |
| `0008_launcher_operation_logs.sql` | 2026-10-05 已应用；新增独立脱敏日志分段表和唯一终结索引，不增加错误数或安装漏斗分母 |

这些迁移保留现有网站表和旧事件，不清空数据库，不新增 `schema_version` 数据库列。ALTER 不可盲目重复执行；如果迁移记录与实际列不一致，先查明差异再修复，不能因为报错直接删除表重建。

### 7.2 推荐发布顺序

1. 核对源码基线、协议一致性及现有配置；执行隔离验证。以下命令以仓库锁定的 Wrangler 4.137.0、Node.js 24 为基线，`npm ci` 用于准备部署工作区。

   ```bash
   npm ci
   npm test
   npm run build
   ```

2. 记录当前 Worker 版本、D1 待应用迁移；将备份路径设在仓库外的受保护位置，导出生产 D1，确认备份文件有效。

   ```bash
   npx wrangler deployments list --json
   npx wrangler d1 migrations list DB --remote
   npx wrangler d1 export nora-landing-analytics --remote --output "$NORA_D1_BACKUP_PATH"
   ```

3. 确认待应用列表符合预期后执行迁移。`apply` 会应用所有未应用迁移，不能未经检查就执行。成功后核对新增列与旧数据仍存在。

   ```bash
   npx wrangler d1 migrations apply DB --remote
   ```

4. 保留既有密钥与绑定，部署新版 Worker。现有部署脚本同时构建并部署静态资源，发布前确认静态资源没有夹带不相关改动。

   ```bash
   npm run deploy
   ```

5. 执行下节的生产验收，保存部署版本、迁移结果及脱敏请求/响应。大批量、非法内容、限流及分页压力场景在隔离环境验证；生产只做最小有效接收、鉴权查询和网站回归。
6. 接收端通过后放行新启动器，在 Windows、Mac Apple 和 Mac Intel 验证真实授权关闭/开启及安装、失败、恢复路径。最后确认开发者取数程序可以取得对应事件，不只验证 POST 成功。

生产合成事件须事先记录唯一 event_id，使用合成内容。验收后仅按这些 event_id 定向清理并核查，不能按日期、cohort 或整表清理。不要把测试数据留作真实业务指标。

## 8. 验收清单与交付证据

| 验收场景 | 通过条件 |
| --- | --- |
| 迁移与配置 | 0005–0007 状态一致，新增列存在，旧表/数据保留，绑定及两项既有密钥保持可用 |
| 旧协议兼容 | 合法 v1/v2 仍可接收、查询，不因 fault 缺失失败 |
| 新协议基础统计 | v3 `fault=null` 正常入库；关闭详细诊断仍收到阶段、耗时与结果 |
| 详细故障 | 合法 v3 fault 入库后可通过鉴权错误页及操作时间线完整读取；指纹可汇总 |
| 权限与隐私 | 所有查询视图无/错读密钥返回 401；非法字段、未脱敏测试内容拒收，不落库 |
| 幂等与冲突 | 同一事件重投只一行；同安装同序号不同事件 ID 返回 identity_conflict，不覆盖原事件 |
| 重试与异常 | 部分接受按事件确认；429/503 保留身份重试；停收不入库且影响符合约定 |
| 错误完整分页 | 隔离环境至少 205 条错误全部读出且不重复；翻页中追加和迟到事件可继续发现；末页/空页游标正确 |
| 过程与结果 | 错误后操作成功，错误仍可查但最终失败数不增加；等待、失联、中断分别显示 |
| 安装漏斗 | 跨日安装、重试成功、存量排除、观察中样本及超过容量拒绝均符合既定口径 |
| 网站回归 | 首页、三平台安装包地址、既有 `/api/events` 与鉴权 `/api/stats` 均保持行为和数据 |
| 真实客户端 | 三平台实际事件与授权行为正确；受信任取数程序取得故障/时间线及漏斗数据 |

交付记录至少包括：接收端 commit 和部署版本、迁移清单、备份位置、隔离测试结果、生产验收时间及脱敏响应、客户端实机范围、测试事件清理记录、取数游标处理结果。密钥和未脱敏日志不放入交付材料。

接收端部署通过只证明接收与查询能力线上可用；三平台客户端发布和真实链路验证应单独记录，不能用源码合并或测试数量代替。

## 9. 回退与现有边界

本次新增列是兼容扩展。Worker 回退时一般保留新增列，避免丢失新证据；不要通过删除列或恢复旧备份常规回退，否则可能覆盖发布后的真实新数据。

新客户端未放行时，可按已记录的版本执行 Worker 回退；已发布 v3 客户端后，应优先修复或回退到支持 v3 的已验收版本。退回仅支持旧协议的接收端会导致新事件被拒绝，必须明确处理该影响，不能宣称链路仍可用。

`npx wrangler rollback <已确认可用的版本ID>` 仅供得到授权后的执行。停收开关会导致当前客户端队列清空，不能把它当作无损缓冲措施。

当前原始事件没有自动清理任务；此次升级不新增留存策略。历史未采集、超过队列限制、长期离线、停收或客户端无法再次运行造成的缺失，不补造。没有终结事件只能报告最后可见状态，无法保证任何断电或强制退出都能取得即时详细原因。

完成本次交接的标准是：接收端线上支持新协议和查询能力，旧网站行为保持，开发者能通过受保护接口取到证据；不是新增一个页面，也不是仅提交代码。
