# 聊天与提示词

## 精确定位聊天

先 `st.character.chats(avatar=...)` 获取真实文件名，再用 `st.chat.inspect` 与 `st.chat.metadata.get`。传入列表中的文件名，不手工添加时间、扩展名或重建相似文件。消息索引从零开始，只计聊天消息，不计文件头。

读取可能包含私人内容。只汇报与当前需求有关的片段，不把整段聊天当作默认诊断输出。

## 正文修改

| 用户明确要求 | 工具 |
| --- | --- |
| 追加用户提供的内容 | `st.chat.message.append` |
| 修改指定消息 | `st.chat.message.edit` |
| 删除指定消息 | `st.chat.message.delete` |

这些工具编辑记录，不等于请求模型生成。写入前重读目标索引与内容；活动页面可能随后覆盖文件，先让该页面停止并行编辑／生成，必要时明确刷新或暂时关闭的步骤。不要把 `force: true` 作为常规参数。

同一次追加若结果未知，先查询消息是否已存在，不重复提交造成双份。替换字段时保留原消息的身份、附加数据、其他分支及未请求内容。执行后读回该消息及邻近消息。

## 聊天范围的上下文

- 作者注释：`st.chat.authors_note.set`，指定当前聊天的 `text`、深度、位置或角色。
- 世界书绑定：`st.chat.worldbook.bind`，绑定前确认目标书实际存在；解除绑定不删除书。
- 本地变量：`st.chat.variables.set`，保留其他变量。
- 持久提示词注入：`st.chat.script_inject.configure`，先读取已有注入并使用明确 `id`，避免重名覆盖。
- 其他元数据：只有明确知道字段含义及作用范围时使用 `st.chat.metadata.patch`，不整份替换文件头。

示例：

```json
{"avatar":"<实际 avatar>","fileName":"<实际聊天文件名>","name":"weather","value":"rainy","confirm":true}
```

这是 `st.chat.variables.set` 的参数，只修改该聊天变量，不是全局变量，也不自动生成下一轮回复。

## 全局提示词与变量

先 `st.prompt.inspect` 检查当前配置。`st.prompt.set_injection` 支持作者注释、Persona、世界书及系统／指令／上下文等受支持目标；它们的存储与作用范围不同，使用前核对描述。局部需求已有聊天覆盖时，不直接改全局默认。

全局变量用 `st.variables.registry` 与 `st.variables.set`；全局变化可能影响其他聊天。保存后检查目标值，不能以设置文件变化代替模型最终上下文或生成效果验证。真实模型生成需要用户授权及可用模型，本技能不虚构生成结果。
