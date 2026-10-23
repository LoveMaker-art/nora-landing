# 角色与世界书

## 已有角色

用 `st.character.list` 找到真实 `avatar`，再用 `st.character.inspect` 读取字段。修改现有角色使用 `st.character.configure`；不要将姓名直接当作文件名。

参数示例，只在用户授权修改该角色场景后使用：

```json
{"avatar":"<列表返回的 avatar>","fields":{"scenario":"夜晚的灯塔旁。"},"confirm":true}
```

本版语义工具支持 `name`、`description`、`personality`、`scenario`、`first_mes`、`mes_example`、`system_prompt`、`post_history_instructions` 和 `alternate_greetings`。以实际工具的可编辑字段为准；保留未请求字段与附带扩展。

改开场白不会改写已保存的第一条聊天；改角色设定也不证明当前页面或模型请求已采用。新建／导入完整角色卡不在这些角色编辑工具的承诺内，有相应页面与授权时按[界面流程](ui.md)处理。

## 世界书

先 `st.worldbook.list`，再 `st.worldbook.inspect(book=...)` 或 `st.worldbook.entries(book=...)`。使用返回的标识区分同名对象，不用显示名猜路径。

新建空书使用 `st.worldbook.create_empty`；已有同名时保留原件，不默认传 `overwrite: true`。条目通过 `st.worldbook.entry.configure` 修改，优先使用检查到的 `uid`：

```json
{"book":"<实际书名>","uid":0,"action":"upsert","fields":{"content":"用户确认的新正文。"},"confirm":true}
```

只切换开关时传 `action: "set_enabled"` 与明确的 `enabled`，不反复 toggle。新增条目明确说明关键词、正文和启停；保留原书中的其他条目及元数据。

条目删除使用 `action: "delete"`，整书删除是 `st.worldbook.delete`，两者分别授权。删除前核对当前聊天、角色或全局是否仍需引用该书；无法确认引用范围时先报告，不宣称删除只影响一个地方。

聊天绑定世界书使用 `st.chat.worldbook.bind`，详见[聊天与提示词](chats-prompts.md)。完成后读回书内容、条目开关或绑定值；条目存在不证明本轮模型请求实际触发了它。
