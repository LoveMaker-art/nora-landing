# 技能安装帮助

标注“诺拉自带”的技能无需在这里另外下载，查看示例后，直接把想做的事告诉诺拉。标注“需要安装”的技能，先安装再使用。不确定是否已经安装，可以先问诺拉。

## 下载需要的技能

| 技能 | 能帮你做什么 | 下载 |
| --- | --- | --- |
| 诺拉性格设计 | 设计性格、语气和相处方式，整理成人格设定 | [下载技能](packages/nora-persona-designer-0.1.3.zip) |
| SillyTavern 管理 | 协助管理你单独安装的 SillyTavern | [下载技能](packages/sillytavern-control-0.2.1.zip) |

## 安装后怎么用

1. 下载后解压，保留完整的技能文件夹，不要只取其中一个文件。
2. 请诺拉确认她正在使用的技能目录，把文件夹放进去。已有同名技能时先检查，保留你修改过的内容。
3. 请诺拉确认技能已经可以使用，再告诉她你想做的事。

如果诺拉运行在云端，技能也需要安装到云端，只下载到自己的电脑上不会生效。

<details>
<summary>手动安装的详细位置</summary>

技能放在当前诺拉的 `HERMES_HOME/skills/creative/` 中。`HERMES_HOME` 是这套诺拉自己的数据目录，不是所有电脑都相同的固定路径；不确定时先让诺拉确认。

保留完整的 `nora-persona-designer/` 或 `sillytavern-control/` 文件夹，其中包含完整的 `SKILL.md`。安装后让诺拉查找并加载技能。

</details>

## 使用诺拉性格设计

对诺拉说：

> 帮我设计诺拉的性格和说话方式。先和我讨论，再给我一份完整的人格设定，由我决定是否使用。

它会给你一份设定文稿，不会自动更换你现在的人格。确认满意后，再到原有的人格设置入口应用。

## 使用 SillyTavern 管理

这个技能用于你单独安装的 SillyTavern。如果你用的是诺拉酒馆，请查看“诺拉酒馆管理”。

使用前需要通过连接服务 `st-mcp` 操作你的 SillyTavern；技能可按你的明确要求协助准备连接，并核验接入结果。下载的技能不包含连接服务或酒馆程序，装好技能不代表已经连通。

连接准备好后，对诺拉说：

> 帮我检查 SillyTavern 的连接，列出已有角色和世界书，先不要修改内容。

部分系统和插件组合尚未实测，先从查看已有内容开始，再按需要尝试修改。

<details>
<summary>连接设置与详细用法</summary>

[连接设置](guides/sillytavern-control/SKILL.md#setup) · [详细用法](guides/sillytavern-control/SKILL.md)

</details>

<details>
<summary>下载文件信息</summary>

以下校验值用于核对下载文件是否完整，普通使用无需手动填写。

- 诺拉性格设计：版本 0.1.3，7271 字节；SHA256 `28603b6af0588552caf63e754a5d3fb4c5918dbc588feeeb608ece0a1e48a340`
- SillyTavern 管理：版本 0.2.1，10443 字节；SHA256 `192637f50cb0ed3bb910118cb7d3449505ef623851620a5f7c288c68039beada`

</details>
