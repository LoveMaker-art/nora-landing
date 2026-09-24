# 诺拉落地页统计接口 · v1

状态：2026-09-24 已部署到 noratavern.com，鉴权查询已验证。数据从本次上线后开始采集，历史数据不会自动补齐。

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
| `summary.download_clicks` | 三个平台按钮点击总次数，包含跳往 GitHub 的回退点击 |
| `summary.download_visitors` | 点击任一平台下载按钮的独立浏览器数；跨平台只算一个 |
| `daily[]` | 每天的上述四项；没有事件的日期补零 |
| `actions[]` | 按 event + action + platform 分组，包含 `count` 次数、`visitors` 独立访客数；供按钮看板使用 |
| `events[]` | 在 actions 基础上按 result 细分，供成功解析/失败/回退排查 |
| `unavailable.create_click_visitors` | `{value:null,status:"entry_removed"}`，当前无云端创建入口 |
| `unavailable.create_success_users` | `{value:null,status:"not_integrated"}`，未对接创建结果 |
| `unavailable.install_success_devices` | `{value:null,status:"not_integrated"}`，未对接启动器安装结果 |

`null` 必须展示“未接入”或“入口已移除”，不可显示成 0。历史未采集的数据不会被补造；上线前日期查询为零，仅代表没有记录。

以下仅为示例，不是真实业务数据：

```json
{
  "schema_version": 1,
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
| download_click | windows / mac-arm64 / mac-x64 | direct：已解析到安装包链接；fallback：跳 GitHub 选择安装包（包括解析未完成时） |
| installer_resolve | installers | latest / previous_complete / http_error / timeout / network_error / no_complete_release / invalid_response |
| help_open | installation / faq-relationship / faq-next / faq-failure | 每次从关闭到展开记录一次 |
| link_click | clawchat / pairing / install-guide / github-fallback / source | ClawChat 下载站、配对说明、完整指南、备用下载、源码入口 |

`clawchat` 是进入 ClawChat 下载页面，不等于已经下载应用。`pairing` 是查看配对指引，不等于配对成功。`direct` 也只表示按钮目标为安装包，不代表文件下载完成。

安装包解析成功率可按 events 的事件次数计算：`(latest + previous_complete) / 全部 installer_resolve`；请求结束前离开页面者不会产生解析结果。

## 身份、来源与准确性

- 浏览器生成随机 visitor_id 保存在 localStorage；后端使用 HMAC 后存储。换设备、浏览器、隐私窗口或清理存储可能计为新访客。GitHub 域名和自定义域名也会各有浏览器标识，不能宣称是跨域真实人数。
- 后端以收到事件的时间统计；每条 event_id 全局唯一，重试不会重复计数。请求失败最多自动重试一次，不承诺绝不丢失。
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
