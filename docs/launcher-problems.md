# 启动器报错去重汇总

## 状态与范围

本视图于 2026-10-02 部署到 noratavern.com，Worker 版本为 `3f83e93e-f2ee-4c84-af8a-efd8de4869c6`。已通过线上鉴权、真实问题汇总/安装明细，以及合成场景的任务去重和后续恢复验证。它仅改变查询展示：不删除或改写事件，不调整启动器、安装漏斗、网站下载或现有查询接口，不需要数据库迁移。

## 接口

```text
GET /api/launcher/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&view=problems
Authorization: Bearer <STATS_READ_KEY>
```

日期按上海时间，最多 93 天。现有 platform、launcher_version、product_version 筛选作用于待汇总的报错；后续任务结果跨版本、跨日期核对，按查询时实际收到的数据判断。没有后续上报不能推断成功或永久失败。

返回 `summary`、`problems`、`next_offset`。每页最多 100 个问题，用 `offset=next_offset` 继续。问题优先按尚未观察到恢复的安装数排序，其次按最后错误时间排序。分页是动态快照，轮询应从 offset=0 刷新、按 problem_id 合并，不能把 offset 当新增事件游标；原始增量导出继续使用 view=errors 的 cursor。

```text
GET /api/launcher/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&view=problems&problem_id=<返回的问题ID>
```

返回 `problem` 和 `installations`，每页最多 100 个安装，用 `next_offset` 继续。安装标识为现有 HMAC，不是用户账号。问题 ID 是稳定技术分组的 SHA-256，不是持久故障工单 ID。日期和筛选变化可改变其计数。

不支持与 operation_id、installation_id、cursor、window_days 混用。offset 必须为 0 至 50000 的整数；问题 ID 必须为 64 位小写十六进制。不存在的问题返回 404。原始错误或结果证据超过 50000 行返回 422 `too_many_events`，不会静默截断；缩小日期/筛选后重查。鉴权方式不变，未授权返回 401。

## 计数口径

- `error_events`：原始错误事件数。仅 launcher_error 和 failed operation_finished，阶段失败事件及心跳不重复纳入。
- `attempts`：按 installation_id + operation_id 去重。一次任务的错误事件和最终失败只计一个任务；用户再次操作仍算新的尝试。
- `failed_attempts`：这些任务最后已收终结结果为 failed 的数量。
- `recovered_attempts`：这些任务最终为 succeeded 的数量，用于解释任务内重试；未结束的任务不算失败。
- `affected_installations`：同类问题受影响安装数，重复点击不增加；不是用户人数。
- 同一个任务可能涉及多个技术问题，各问题计数不可直接相加当成总体数；总体 summary 独立去重。

有详细包时，按故障指纹、平台、动作、错误来源/位置和技术状态合并，可跨阶段及版本。同任务的无详细包伴随错误只在技术字段一致且该任务只有一个候选指纹时关联。没有详细包则按技术字段和阶段粗分组，`grouping_basis=technical_signature`，不能声称这些事件一定具有相同根因。

## 恢复判断

`recovered_installations` 只在该安装此类报错之后，同一动作的最新已收状态为成功终结时计入。最近的重试仍在运行、后来再次失败或缺少结果，均归入 `no_observed_recovery_installations`；它表示尚无恢复证据，不表示永久故障。

安装明细保留：

- `recovery`：succeeded_same_action 或 no_observed_recovery。
- `latest_action_outcome`：同一动作最近的已收事件、阶段、状态和时间。
- `later_same_action_success`：曾在本次分组最后报错后成功过，最新尝试可能又未完成或失败。
- `later_start_succeeded`、`later_runtime_ready`：后来是否启动成功、首次连接就绪。
- `current`：主流程最后已收状态及时间，不是实时在线状态。
- `latest_error_event_id`、`latest_error_operation_id`：回查详细错误或原始任务时间线。

更新失败后启动旧版本成功，不算更新恢复，只显示 later_start_succeeded。安装漏斗的历史首次成功继续按安装编号计一次，不被后续更新失败抹去；它与当前报错恢复状态是两个不同指标。

## 验证

覆盖同任务错误/终结去重、多次重试、多个安装、跨版本阶段合并、缺少详细包的保守分组、同动作恢复、不同动作成功不误判、恢复后再次失败、未结束/缺失证据、跨日期结果、鉴权与非法参数，以及超过 100 个安装的分页。
