# 技能下载与安装

本页提供两项独立扩展的完整技能目录。项目中的另外五项技能用于展示已有能力，不需要从这里单独下载。

| 技能 | 完整安装包 | 版本 |
| --- | --- | --- |
| 诺拉人格设计 | [nora-persona-designer](packages/nora-persona-designer-0.1.2.zip) | 0.1.2 |
| 原版酒馆控制技能组 | [sillytavern-control](packages/sillytavern-control-0.1.0.zip) | 0.1.0 |

## 安装到当前诺拉实例

1. 下载 ZIP 并解压，保留整个 `nora-persona-designer/` 或 `sillytavern-control/` 文件夹，包括 SKILL.md 及全部参考文件。
2. 放入当前实例的 `HERMES_HOME/skills/creative/`。HERMES_HOME 是实际运行诺拉的 Hermes 数据目录，不是固定的系统目录；不确定时，先让诺拉确认当前实例路径。
3. 已有同名技能时先核对版本及自定义内容，再决定是否替换。云端诺拉需安装到云端运行实例，不是只放在自己的电脑上。
4. 新开对话，让诺拉通过 `skills_list` 确认能发现技能，再用 `skill_view` 加载；参考文件也应能读取。

例如人格技能目录应包含：

```text
HERMES_HOME/skills/creative/nora-persona-designer/
├── SKILL.md
├── references/design-guide.md
└── templates/SOUL.md
```

## 诺拉人格设计

对诺拉说：

> 使用 nora-persona-designer，帮我设计自己的诺拉。先和我讨论性格，再给我完整的 SOUL.md，由我自己复制更换。

本技能输出完整人格文稿，由用户在已有的人格设定入口复制更换。不会自动覆盖活动人格、修改模型配置或重启诺拉；技能内的模板不是用来直接覆盖当前 SOUL.md 的成品。

[完整技能说明](guides/nora-persona-designer/SKILL.md)

## 原版酒馆控制技能组

适用于原版 SillyTavern，与诺拉酒馆的内置 `tavern` 技能不同。需要另行安装并配置 `st-mcp`，此 ZIP 不捆绑 MCP 服务、依赖或酒馆程序。

先按[st-mcp 接入说明](guides/sillytavern-control/references/setup.md)定位同一实例的服务、程序和用户数据，再对诺拉说：

> 使用 sillytavern-control，先检查我指定的原版酒馆连接，列出已有角色和世界书，暂时不要修改内容。

已在 macOS 隔离环境中对原版 SillyTavern 1.18.0 与 st-mcp 0.12.0 完成后台联调。页面桥操作、真实模型调用、第三方插件执行、MVU 实际更新及 Windows/Linux 尚未实测，不代表全部控制能力或所有平台兼容。

[完整技能说明](guides/sillytavern-control/SKILL.md)

## 文件校验

- nora-persona-designer-0.1.2.zip：8579 字节；SHA256 `48b267b32a12ff4b5204f6e3e13c38da524d03471a9e54595dd62bf5959b3f07`
- sillytavern-control-0.1.0.zip：13405 字节；SHA256 `db682715ed0520f8d68e0df6c2ca0d1c8bfbcad8b67494dd8303447a8e9c6cd3`
