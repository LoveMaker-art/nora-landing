# 扩展与脚本

## 前端扩展和服务端插件

`st.extension.registry` 查询前端扩展；`st.plugin.registry` 查询服务端插件。前端扩展通常需要页面刷新，服务端插件和服务器开关通常需要重启；分别报告 `reloadRequired` 和 `restartRequired`。

用户只问插件状态时只读。安装前明确仓库来源和执行范围；用户授权安装不自动授权启用所有脚本、开放公网或执行任意安装命令。

| 目标 | 工具与边界 |
| --- | --- |
| 安装前端扩展 | `st.extension.install`；先核对 URL、安装位置及已有同名对象，安装后重查实际启停状态 |
| 启停前端扩展 | `st.extension.set_enabled`；使用注册表中的真实 `name` 与明确布尔值 |
| 修改扩展配置 | `st.extension.configure`；从已有配置或扩展说明确认 `configKey` 和字段，只修改用户选项 |
| 安装服务端插件 | `st.plugin.install`；需要用户明确接受服务端代码执行，重启另按授权处理 |
| 服务端插件总开关 | `st.plugin.configure`；这是服务器范围配置，不是单个前端插件开关 |

`allowCreate` 只在已确认扩展的实际配置结构时使用，不凭名称猜新对象。原版 ST 扩展协议与诺拉酒馆插件库接口不同，不调用 `/api/extensions/library` 来假设原版具备诺拉的策略。

本版没有专门的 `st.extension.uninstall` 或 `st.plugin.uninstall` 语义工具；不要编造。用户要求卸载时，存在相应原版管理界面且已授权操作，才走[界面流程](ui.md)；否则明确缺少已验证的卸载路径。停用和删除文件不是同一结果。

## 正则

`st.regex.registry` 获取全局规则；`st.regex.configure` 负责新建、修改、启停和删除。先确认作用位置及 `markdownOnly`／`promptOnly`，新建规则先保持关闭供检查；用户已明确授权启用时再按范围启用。

用具体输入和预期输出核对正则，保留其他规则。改显示规则不等于清理原聊天；改发给模型的规则可能影响后续上下文。角色局部规则不假装可经全局接口安全修改。

## Quick Reply

`st.quick_reply.registry` 读取已有集合；`st.quick_reply.configure` 配置集合及回复。文本可能含斜杠命令，新建先关闭自动执行项。用户要求创建一个按钮，不自动授权 `executeOnStartup`、`executeOnUser`、`executeOnAi` 等后台触发。

写入成功仅证明配置保存。按钮出现、点击执行与自动触发需要相应页面和实际运行证据；不能从配置存在推断已执行成功。
