# MVU

MVU 是扩展能力，原版 ST 或本技能安装完成不代表 MVU 已安装、启用或初始化。

| 要确认的对象 | 读取／修改工具 |
| --- | --- |
| 全局 MVU 设置 | `st.mvu.settings.get`／`st.mvu.settings.configure` |
| 世界书中的 MVU 规则条目 | `st.mvu.entries`／`st.mvu.entry.set_enabled` |
| 某聊天已保存的变量快照 | `st.mvu.chat_state.inspect` |
| 明确要求修正某消息中的变量数据 | `st.mvu.chat_state.patch` |

先区分用户说的“关闭 MVU”是关闭额外模型、规则条目、前端扩展还是其他选项。读取实际扩展版本和字段，不把一个开关描述为所有 MVU 功能。

聊天状态始终指定实际 `avatar` 与 `fileName`；修改时再确定消息索引和路径，读取后只修正用户确认的值。`stat_data` 存在不证明运行器健康，直接改值也不能作为修复运行器的替代证据。

凭据只用于已授权配置，不在回复、示例或诊断文档中展示。配置、规则命中、变量初始化、某轮更新及可见状态栏分别验证；实际 MVU 调用可能需要脚本和额外模型授权。
