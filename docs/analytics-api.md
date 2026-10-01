# 诺拉落地页统计接口 · v2

状态：2026-09-30 v2 已部署，精简与兼容查询接口均返回 200，三个平台下载地址接口正常。新指标从本次上线开始采集，旧数据保留，不补造历史结果。

## 推荐：精简看板接口

使用同一查询密钥，请求 `GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&view=dashboard`。
主面板只读取 `summary` 中四个字段，`daily` 提供对应趋势：

| 字段 | 看板名称 |
|---|---|
| pv | 浏览次数 |
| uv | 访问人数（浏览器去重） |
| download_click_visitors | 点击下载人数（浏览器去重） |
| download_ready_visitors | 有效下载请求人数（浏览器去重） |

`platforms` 提供 Windows、Mac Apple、Mac Intel 的点击与有效请求访客数，不能相加作为全站人数。
`diagnostics` 仅供排查：`raw_download_clicks` 原始点击次数、`ready_requests` 有效请求次数、`failed_requests` 失败次数，以及 `failures` 按平台和原因细分。不放在主指标卡上。

这个视图不展示旧解析状态、direct/fallback，也不展示未接入的创建/安装指标；没有新增埋点或另存一套汇总数据。不传 view 的原接口和历史事件保留，已有看板不会因字段删除中断。

“有效下载请求”仍由浏览器上报，只说明安装包地址已经验证并发起导航，不能改名为下载完成或安装成功。新口径没有历史回填，上线前的零值不能解释为请求全部失败。

## 给看板同事

通过你们看板的后端调用接口，不要把查询密钥放进公开网页 JavaScript。接口返回 JSON，不需要登录 Cloudflare 或 Umami。

- 地址：`GET https://noratavern.com/api/stats`
- 鉴权：请求头 `Authorization: Bearer <STATS_READ_KEY>`。密钥单独交付，不包含在此文档。
- 必填参数：`from=YYYY-MM-DD`、`to=YYYY-MM-DD`，包含起止两天，最多 93 天。
- 时区：Asia/Shanghai，按每天 00:00–24:00 统计。
- 可选筛选：`channel`（来源渠道）和 `hostname`（来源站点）。
- 建议看板每 5 分钟查询一次；接口不缓存，事件写入后可查。

```python
import os
import requests

r = requests.get(
    'https://noratavern.com/api/stats',
    params={'from': '2026-09-24', 'to': '2026-09-30'},
    headers={'Authorization': 'Bearer ' + os.environ['NORA_STATS_READ_KEY']},
    timeout=15,
)
r.raise_for_status()
data = r.json()
print(data['summary'])
```

## 返回字段与口径

| 字段 | 含义 |
|---|---|
| `summary.pv` | 周期内页面浏览事件数；刷新重新计入、页内锚点跳转不计入，浏览器后退恢复页面也计一次 |
| `summary.uv` | 周期内有页面浏览记录的独立浏览器标识数 |
| `summary.download_clicks` | 三个平台按钮的原始点击总次数，包含重复点击、忙碌或冷却期间被拦截的点击 |
| `summary.download_visitors` | 点击任一平台下载按钮的独立浏览器数；跨平台只算一个 |
| `summary.download_ready_requests` | 浏览器收到并验证安装包地址的有效请求次数；不等于文件下载完成 |
| `summary.download_ready_visitors` | 上述有效请求的独立浏览器数 |
| `summary.download_failed_requests` | 实际发起但失败的请求次数 |
| `daily[]` | 每天的上述指标；没有事件的日期补零 |
| `actions[]` | 按 event + action + platform 分组，包含 `count` 次数、`visitors` 独立访客数；供按钮看板使用 |
| `events[]` | 在 actions 基础上按 result 细分，供成功解析/失败/回退排查 |
| `unavailable.create_click_visitors` | `{value:null,status:"entry_removed"}`，当前无云端创建入口 |
| `unavailable.create_success_users` | `{value:null,status:"not_integrated"}`，未对接创建结果 |
| `unavailable.install_success_devices` | `{value:null,status:"not_integrated"}`，未对接启动器安装结果 |

`null` 必须展示“未接入”或“入口已移除”，不可显示成 0。历史未采集的数据不会被补造；上线前日期查询为零，仅代表没有记录。

以下仅为示例，不是真实业务数据：

```json
{
  "schema_version": 2,
  "timezone": "Asia/Shanghai",
  "from": "2026-09-24",
  "to": "2026-09-24",
  "identity": "anonymous_browser_per_origin",
  "summary": {"pv": 120, "uv": 80, "download_clicks": 32, "download_visitors": 25},
  "daily": [{"date":"2026-09-24","pv":120,"uv":80,"download_clicks":32,"download_visitors":25}],
  "actions": [{"event":"download_click","action":"windows","platform":"windows","count":20,"visitors":16}],
  "events": [{"event":"download_click","action":"windows","platform":"windows","result":"direct","count":18,"visitors":15}],
  "unavailable": {
    "create_click_visitors":{"value":null,"status":"entry_removed"},
    "create_success_users":{"value":null,"status":"not_integrated"},
    "install_success_devices":{"value":null,"status":"not_integrated"}
  }
}
```

禁止把每日 UV 相加当周期 UV，也不能把各按钮 visitors 相加当全部点击人数。同一浏览器可能跨天、多平台重复出现。`actions` 已跨 result 去重，而 `events` 各 result 的访客数不能直接相加。

## 采集范围

| event | action / platform | result / 含义 |
|---|---|---|
| pageview | 空 | 页面访问 |
| download_click | windows / mac-arm64 / mac-x64 | 新客户端仅 click；旧 direct / fallback 仅兼容历史，不可据此计算成功率 |
| download_ready | windows / mac-arm64 / mac-x64 | ready：浏览器已验证返回地址并发起文件导航 |
| download_failed | windows / mac-arm64 / mac-x64 | rate_limited / http_error / timeout / invalid_response / network_error |
| installer_resolve | installers | latest / previous_complete / http_error / timeout / network_error / no_complete_release / invalid_response |
| help_open | installation / faq-relationship / faq-next / faq-failure | 每次从关闭到展开记录一次 |
| link_click | clawchat / pairing / install-guide / github-fallback / source | ClawChat 下载站、配对说明、完整指南、备用下载、源码入口 |

`clawchat` 是进入 ClawChat 下载页面，不等于已经下载应用。`pairing` 是查看配对指引，不等于配对成功。`direct` 也只表示按钮目标为安装包，不代表文件下载完成。

`installer_resolve` 是历史客户端解析事件，当前下载实现不再发送，不能用于当前成功率。新结果为客户端报告，不是 GitHub 传输日志或服务端认证的下载成功。Ctrl/Command 等修饰键打开新标签、直接访问下载接口或禁用脚本不产生新结果事件；离开页面前未取得结果也可能缺失。

## 身份、来源与准确性

- 浏览器生成随机 visitor_id 保存在 localStorage；后端使用 HMAC 后存储。换设备、浏览器、隐私窗口或清理存储可能计为新访客。GitHub 域名和自定义域名也会各有浏览器标识，不能宣称是跨域真实人数。
- 新客户端携带事件发生时间，统计归入发生日，另存 received_at。旧客户端无时间字段时仍按接收时间；允许补报最近 7 天事件，最多容许未来 5 分钟的时钟误差并截到接收时间。非法时间拒绝。
- 待上报事件保存在浏览器 localStorage，每条单独存储避免多标签覆盖，最多 200 条、保存 7 天。网络错误、429 和服务异常自动退避重试，在线或重新打开网站时补报；event_id 不变，数据库主键去重。400/403/413 为永久拒绝并移除。存储禁用时仅内存重试，关页无法保留；清空存储、超过期限/容量、脚本拦截仍可能丢失。
- channel 优先取 utm_source，否则取 referrer 的域名，无来源记 direct。不存完整 referrer URL 或查询字符串；渠道按当前页面来源计算，不是跨设备归因。
- 推荐推广链接：`https://noratavern.com/?utm_source=qq_group`。不要在渠道参数中填手机号、账号或其他个人信息。
- 统计只记录可正常执行脚本且请求送达的事件；广告拦截、断网、异常流量限速均会影响计数。
- 浏览器事件不能证明是真人；Origin 校验不是身份认证。已配置每 IP 每 60 秒 300 次采集限速，共享出口网络可能被一起限速。不将 IP 写入统计数据库。
- 不采集聊天内容、模型 API Key、配对码或账号密码。不追溯上线前的旧数据。

## 接口状态码

| 状态码 | 含义 |
|---|---|
| 200 | 查询成功 |
| 202 | 事件已接收，重复 event_id 也返回此状态但不重复存储 |
| 400 | 日期范围、筛选条件或事件格式错误 |
| 401 | 查询密钥缺失或错误 |
| 403 | 采集请求来源不允许 |
| 404 | 接口不存在，创建成功接口尚未开放 |
| 429 | 采集过于频繁 |
| 503 | 数据库、密钥或服务暂不可用；不能当作零数据 |

采集接口 `POST /api/events` 供落地页使用；同事接看板只需要 GET 查询接口。它不接受任意事件或安装/创建成功事件，防止混淆网站点击与业务成功。

## 运维说明

数据保存在站点所有者 Cloudflare 账号中的 `nora-landing-analytics` D1 数据库；不是 GitHub 仓库，也不是个人电脑。原始事件目前持续保留，不自动删除。用量需在 Cloudflare 控制台查看，没有承诺永久免费或无限容量。

查询密钥可轮换；`VISITOR_HASH_SECRET` 用于访客去重，应长期保留，变更它会让同一访客在变更前后成为两个统计标识。生产数据库的初始化 SQL 只创建不存在的表和索引，不清空原数据。

后续若要新增实际安装成功或创建成功，需要另外接入启动器/服务端的可信上报，并解决访客到安装实例的关联。当前看板不应据此计算“创建转化率”。


## v2 上线顺序与兼容性

1. 备份生产 D1 后应用 `0004_website_outcomes.sql`。迁移保留原事件及时间，扩展允许的事件类型，并增加接收时间。
2. 发布服务端和静态资源。先迁移后发布；旧客户端事件仍然被接受，旧查询字段仍保留。
3. 查询 `schema_version: 2` 并核验新结果。历史日期新字段为 0 代表未采集，不代表无有效请求。

看板应将 `download_clicks` 标注为“原始点击”，`download_ready_requests` 标注为“有效下载请求”。不合并、不改写旧点击记录，不从 direct/fallback 推断下载完成。不同事件可能跨日或因补报暂时不齐，不能直接把时间段内总量相除称作完整漏斗。

此次没有接入启动器和安装结果，也没有改变安装包选择、备用逻辑、版本或页面样式。

## 启动器采集与定时查询

当前范围：启动器上报 → Cloudflare Worker 接收 → D1 存储 → 开发者定时调用查询接口。不新增监控页面。复用现有 Worker、数据库和读密钥；启动器数据单独保存在 `launcher_events`，网站 `/api/events`、`/api/stats` 及已有网站统计保持原契约，不将浏览器访客与安装标识关联。

### 当前交付状态

| 内容 | 状态 |
| --- | --- |
| 基础事件接收与查询 | 2026-09-30 有部署和入库验收记录，见本节末尾 |
| v3 详细故障接收与查询 | 已合入本地 main；本轮未部署，生产新增字段及带鉴权查询尚未验收 |
| 首次安装漏斗查询 | 已纳入本地 main 并通过隔离查询验证；尚未部署，见 [漏斗查询说明](launcher-funnel.md) |
| 新启动器上报规则 | 启动器仓库已合入本地 main；安装包尚未发布 |

源码合并不等于线上生效，旧启动器不会自动获得新的采集规则，历史缺失事件不回补。

### 接收接口

`POST https://noratavern.com/api/launcher/events` 接收 `{ "events": [...] }`。当前协议为 v3，接收端保留 v1/v2 兼容。事件、字段、阶段和错误码的唯一白名单是 `server/launcher-contract.json`，与启动器 `telemetry-contract.json` 同步。

- 基础操作阶段、耗时、状态和固定技术错误码不受详细诊断开关控制。详细诊断默认关闭；用户主动授权后，新操作的故障事件才带脱敏 `fault`。关闭详细诊断不停止基础统计。
- 单批 1 至 20 条，最大 60,000 字节；故障包最大 24 KiB。最多回溯 7 天，容忍客户端快 5 分钟；未知字段、非法错误码及未脱敏内容拒收。
- 安装随机标识经 HMAC 后入库，服务端不保存原始 IP、安装 UUID、请求头或完整本地日志。数据用于关联安装环境，不等于真实人数。详细包不包含密钥、聊天、模型回复、配置全文或 Hermes 日常内部日志。
- 公开采集接口不携带查询密钥。现有 IP 限流及 `LAUNCHER_TELEMETRY_PAUSED=true` 停收机制保留。
- 202 返回 `accepted_event_ids` 和 `rejected_event_ids`；重试不重复写入。`invalid_event`、`identity_conflict` 是单条永久拒绝，429 或 503 不代表成功接收。

### 查询接口

`GET https://noratavern.com/api/launcher/stats?from=YYYY-MM-DD&to=YYYY-MM-DD`

使用现有 `Authorization: Bearer <STATS_READ_KEY>`。由开发者自己的受信任脚本或服务定时请求，读密钥不进入启动器、公开网页 JavaScript、日志或版本库。接口返回 JSON；请求失败不能当成零数据或安装成功。本文不创建定时任务，取数频率由调用方决定。

日期按上海时间解释，最多 93 天。常规查询可按 `platform`、`launcher_version`、`product_version` 筛选。

| 字段 | 含义 |
| --- | --- |
| `summary` | 时间段内新安装环境、安装完成、首次运行就绪及失败操作数；不是同一批环境的严格转化率 |
| `failures` | 最终失败操作按阶段、错误来源、技术码、HTTP 状态及版本等分组 |
| `errors` | 最近错误事件及脱敏 `fault`，通过 `operation_outcome` 关联最终结果；重试错误不代表最终失败 |
| `issues` | 按故障指纹汇总受影响操作数和安装环境数 |
| `durations` | 成功阶段的样本数、平均和最大耗时，不等于操作总耗时 |
| `current` | 安装、更新等主流程的最后已收状态，不被独立模型列表或更新检查覆盖；并非在线人数 |
| `operations` | 各操作的最后已收状态 |

`current_truncated`、`operations_truncated` 表示对应结果超过 200 项；`errors_truncated`、`failures_truncated`、`issues_truncated` 表示错误详情或分组超过 100 项。取数程序需要保留这些截断信息，不能将有限结果当成全量导出。慢、疑似停滞、失去联系和等待用户是不同状态，无终结事件不能推断已失败或已恢复。

完整发现故障使用 `view=errors&cursor=0`，保持相同日期和平台/版本筛选。每页最多 100 条，按入库顺序而非客户端发生时间返回 `errors`，保留 `fault` 与查询时的 `operation_outcome`。保存返回的 `next_cursor`，当 `has_more=true` 时继续请求下一页；为 false 时也保存游标，后续轮询从该位置继续。空页返回原游标。迟到补报与翻页期间新入库的事件不会插入已读页。该视图复用相同读密钥，不使用操作时间线的 offset，也不能同时指定 operation_id、installation_id 或 window_days。

日期仍按事件发生日筛选；游标只保证所选范围内已入库错误的连续读取，不会返回范围外事件。调用方应覆盖客户端最多 7 天的补报窗口；扩大历史范围、改变平台/版本筛选或恢复/重建数据库时，从 cursor=0 重新读取并按 event_id 去重。操作最终结果可能在错误首次取出后到达，需要时再按 operation_id 查询时间线。聚合分组的截断不会丢弃 D1 中的原始记录，可从完整错误页自行汇总。

追加 `operation_id=<操作UUID>` 查询该次操作的 `timeline`，可限定 `installation_id=<查询返回的HMAC标识>`。每页最多 500 条，用 `next_offset` 继续；`timeline[].fault` 可查看故障证据。操作时间线取该操作全部事件，不受日期、版本过滤限制，但日期参数仍须合法。

首次安装漏斗采用 `view=funnel`，复用已有事件，其观察窗口、转化率与缺失数据口径集中维护在 [漏斗查询说明](launcher-funnel.md)，不在这里重复定义。该视图已纳入本地 main，尚未上线。

原始事件保留期限尚未确定，当前没有自动删除任务。断网、停收、队列淘汰或客户端未启动会造成缺失；接口不补造这些数据，也不根据基础设施访问日志推断用户行为。

### 部署与验收顺序

1. 备份现有生产 D1，核对迁移记录；在基础 `0005_launcher_events.sql` 上依次应用 `0006_launcher_error_details.sql`、`0007_launcher_fault_packets.sql`，保留网站表和旧事件。
2. 部署 Worker，复用现有 `VISITOR_HASH_SECRET`、`STATS_READ_KEY`；验证接收、重试去重、停收、鉴权和带读密钥的实际查询。
3. 发布完成三平台实机验收的新启动器，确认真实事件可以接收并由开发者取数端查询。旧接收端不认识 v3，不能先发布新客户端。

### 2026-09-30 基础接收端部署记录

- 已备份生产 D1，并成功应用 `0005_launcher_events.sql`。备份保存在操作人员本机，不提交仓库。
- 已部署 Worker 版本 `4a8b483d-0233-4437-83d2-b814570d5f65`；上一个可回退版本为 `3c5ae6d4-50e1-433d-929b-d56c466f7dbc`。静态资源没有变化。
- 实际请求 `https://noratavern.com/api/launcher/events` 两次返回202，D1核查仅一条记录，安装标识为64位HMAC；验收记录已定向删除并核查为零。
- 首页返回200，新旧查询接口未授权均返回401。现有网站统计表仍可查询，未修改其数据。
- 持查询密钥的线上查询尚待验收，未取得密钥也未轮换现有密钥。启动器未打包、替换或发布；不能将服务端上线理解为用户启动器已经开始上报。
