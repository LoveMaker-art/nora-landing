// Project skills checked against c65d44b; standalone packages supplied by the author on 2026-10-23.
export default [
  {
    "id": "nora-persona-designer",
    "category": "内容创作",
    "icon": "person",
    "title": "诺拉人格设计",
    "description": "和诺拉一起设计性格与相处方式，生成完整的人格文稿。",
    "delivery": "download",
    "version": "0.1.2",
    "package": "packages/nora-persona-designer-0.1.2.zip",
    "bytes": 8579,
    "sha256": "48b267b32a12ff4b5204f6e3e13c38da524d03471a9e54595dd62bf5959b3f07",
    "benefits": [
      "通过对话确定性格、语气、称呼与相处方式，按需借鉴你选定的角色特点。",
      "设计或调整人格草稿，使用具体场景与试聊题检查表达。",
      "输出完整、可复制的 SOUL.md，由你在现有入口手动更换。"
    ],
    "prompt": "使用 nora-persona-designer，帮我设计自己的诺拉。先和我讨论性格，再给我完整的 SOUL.md，由我自己复制更换。",
    "requirement": "这是人格文稿设计技能，不会自动覆盖活动人格、修改模型配置或重启诺拉。技能中的模板也不能直接覆盖当前 SOUL.md。",
    "sourceURL": "guides/nora-persona-designer/SKILL.md",
    "sourceLabel": "查看技能说明 ↗"
  },
  {
    "id": "sillytavern-control",
    "category": "酒馆管理",
    "icon": "story",
    "title": "原版酒馆控制技能组",
    "description": "通过 st-mcp 管理原版 SillyTavern，需要单独配置连接。",
    "delivery": "download",
    "version": "0.1.0",
    "package": "packages/sillytavern-control-0.1.0.zip",
    "bytes": 13405,
    "sha256": "db682715ed0520f8d68e0df6c2ca0d1c8bfbcad8b67494dd8303447a8e9c6cd3",
    "benefits": [
      "管理指定原版酒馆的角色、世界书、聊天与提示词；修改后读取实际结果。",
      "按任务查看扩展、脚本、MVU、界面和维护恢复的使用说明。",
      "已在 macOS 隔离环境联调原版 SillyTavern 1.18.0 与 st-mcp 0.12.0 的后台读写。"
    ],
    "prompt": "使用 sillytavern-control，先检查我指定的原版酒馆连接，列出已有角色和世界书，暂时不要修改内容。",
    "requirement": "适用原版 SillyTavern，与诺拉酒馆内置 tavern 技能不同。压缩包不包含 st-mcp 或酒馆程序；页面桥、真实模型调用、第三方插件执行、MVU 实际更新及 Windows/Linux 尚未实测。",
    "sourceURL": "guides/sillytavern-control/SKILL.md",
    "sourceLabel": "查看技能说明 ↗",
    "setupURL": "guides/sillytavern-control/references/setup.md"
  },
  {
    "id": "nora-cardforge",
    "category": "内容创作",
    "icon": "cards",
    "title": "世界卡制作",
    "description": "制作世界卡，评估和润色已有卡，整理成可交付文件。",
    "benefits": [
      "从角色、世界观和玩法出发制作世界卡，按需加入世界书、MVU、正则与状态栏。",
      "检查已有卡的内容和结构；按你的要求润色文案，保留原有玩法。",
      "构建并导出 JSON 或带封面的 PNG；需要导入时再交接到酒馆。"
    ],
    "prompt": "帮我制作一张雨夜酒馆的世界卡，老板是一位退休赏金猎人。先和我确定角色、世界观和玩法，再制作成品，暂不导入酒馆。",
    "requirement": "制作文件与导入酒馆是两个步骤；导入需要已连接的酒馆与 Nora MCP。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/creative/nora-cardforge/SKILL.md",
    "sourceLabel": "查看项目技能源码 ↗"
  },
  {
    "id": "tavern",
    "category": "酒馆管理",
    "icon": "world",
    "title": "酒馆管理",
    "description": "管理世界、角色和资料库，也能检查剧情进展与设定。",
    "benefits": [
      "创建或导入世界，管理角色、玩家身份、世界书与提示词预设。",
      "查看指定世界的剧情进展，管理会话、聊天备份和剧情账本。",
      "协助配置酒馆模型、外观及受支持的插件，查看故事档案。"
    ],
    "prompt": "帮我查看酒馆里有哪些世界，列出名称。我选定后，再帮我看看那个世界的剧情进展，先不要修改内容。",
    "requirement": "需要连接当前酒馆的 Nora MCP；修改、删除及模型调用按你的具体授权执行。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/creative/tavern/SKILL.md",
    "sourceLabel": "查看项目技能源码 ↗"
  },
  {
    "id": "tavern-ops",
    "category": "运行维护",
    "icon": "tools",
    "title": "故障诊断",
    "description": "排查酒馆服务、MCP 连接和 Liveware 入口问题。",
    "benefits": [
      "分开检查酒馆服务、诺拉与酒馆的 MCP 连接，以及外部入口。",
      "查看相关状态和日志，定位失败环节及仍缺少的证据。",
      "在明确授权后，使用现有维护流程恢复指定实例。"
    ],
    "prompt": "酒馆入口打不开，帮我检查当前实例的服务和连接状态，说明问题在哪一层，先不要重启或重装。",
    "requirement": "诊断不等于自动修复；重启、恢复或配置修改需要明确授权。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/creative/tavern-ops/SKILL.md",
    "sourceLabel": "查看项目技能源码 ↗"
  },
  {
    "id": "tavern-updater",
    "category": "运行维护",
    "icon": "clock",
    "title": "版本更新",
    "description": "检查适用的新版本，按你的要求更新并核对结果。",
    "benefits": [
      "先检查当前安装适用的更新，不因查询版本自动启动更新。",
      "支持的桌面安装可按顺序更新酒馆和启动器；云端或源码实例使用核心更新流程。",
      "检查任务进度与实际更新结果，区分完成、部分完成和失败恢复。"
    ],
    "prompt": "帮我检查当前诺拉酒馆有没有可用更新，告诉我适用的更新内容，先不要执行更新。",
    "requirement": "是否支持更新取决于当前安装与更新入口；旧版可能需要先迁移。更新期间诺拉可能短暂断开。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/system/tavern-updater/SKILL.md",
    "sourceLabel": "查看项目技能源码 ↗"
  },
  {
    "id": "model-provider-config",
    "category": "运行维护",
    "icon": "settings",
    "title": "诺拉模型配置",
    "description": "配置或切换本地诺拉的模型服务商、模型与 API Key。",
    "benefits": [
      "根据你提供的服务商、模型和 API Key 保存本地诺拉的默认模型配置。",
      "支持内置服务商与自定义 OpenAI 兼容接口；自定义接口需提供 Base URL。",
      "只修改诺拉模型，保留酒馆模型、MVU 模型和其他实例的配置。"
    ],
    "prompt": "我想切换本地诺拉使用的模型。请先告诉我需要提供哪些信息，只改诺拉，不修改酒馆和 MVU 模型。",
    "requirement": "仅适用于受支持的本地启动器实例；保存后新会话生效，配置保存不代表 API 已验证。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/system/model-provider-config/SKILL.md",
    "sourceLabel": "查看项目技能源码 ↗"
  }
];
