// Project skills checked against c65d44b; standalone resources synced from the author on 2026-10-29.
export default [
  {
    "id": "nora-persona-designer",
    "category": "内容创作",
    "icon": "person",
    "title": "诺拉性格设计",
    "description": "和诺拉一起设定性格、说话方式与相处习惯。",
    "delivery": "download",
    "version": "0.1.3",
    "package": "packages/nora-persona-designer-0.1.3.zip",
    "bytes": 7271,
    "sha256": "28603b6af0588552caf63e754a5d3fb4c5918dbc588feeeb608ece0a1e48a340",
    "benefits": [
      "一起确定性格、语气、称呼和相处方式。",
      "通过试聊调整表达，整理成一份完整的人格设定。",
      "保留你的选择，等你确认后再自行应用。"
    ],
    "prompt": "帮我设计诺拉的性格和说话方式。先和我讨论，再给我一份完整的人格设定，由我决定是否使用。",
    "requirement": "只生成人格设定文稿，不会自动更换你现在的人格，也不会修改模型设置。",
    "sourceURL": "guides/nora-persona-designer/SKILL.md",
    "sourceLabel": "阅读详细用法 ↗"
  },
  {
    "id": "sillytavern-control",
    "category": "酒馆管理",
    "icon": "story",
    "title": "SillyTavern 管理",
    "description": "让诺拉协助管理你已有的 SillyTavern。",
    "delivery": "download",
    "version": "0.2.1",
    "package": "packages/sillytavern-control-0.2.1.zip",
    "bytes": 10443,
    "sha256": "192637f50cb0ed3bb910118cb7d3449505ef623851620a5f7c288c68039beada",
    "benefits": [
      "查看和整理角色、世界书与聊天记录。",
      "按你的要求调整提示词，检查支持的扩展设置。",
      "先检查连接和目标，再处理你指定的内容。"
    ],
    "prompt": "帮我检查 SillyTavern 的连接，列出已有角色和世界书，先不要修改内容。",
    "requirement": "用于单独安装的 SillyTavern，需通过 st-mcp 连接，技能可协助接入。下载包不包含 st-mcp 或酒馆程序；部分系统与插件组合尚未实测。",
    "sourceURL": "guides/sillytavern-control/SKILL.md",
    "sourceLabel": "阅读详细用法 ↗",
    "setupURL": "guides/sillytavern-control/SKILL.md#setup"
  },
  {
    "id": "nora-cardforge",
    "category": "内容创作",
    "icon": "cards",
    "title": "世界卡创作",
    "description": "把角色、背景和玩法想法，做成可以使用的世界卡。",
    "benefits": [
      "从你的想法出发，设计角色、世界背景与故事玩法。",
      "检查和润色已有卡片，保留你想要的设定。",
      "导出卡片文件，需要时再帮你导入酒馆。"
    ],
    "prompt": "帮我制作一张雨夜酒馆的世界卡，老板是一位退休赏金猎人。先和我确定角色、背景和玩法，做好后先给我看看，不要导入。",
    "requirement": "生成卡片不会自动导入酒馆。导入前，需要先连接诺拉与酒馆。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/creative/nora-cardforge/SKILL.md",
    "sourceLabel": "阅读详细用法 ↗"
  },
  {
    "id": "tavern",
    "category": "酒馆管理",
    "icon": "world",
    "title": "诺拉酒馆管理",
    "description": "让诺拉帮你整理世界、角色和资料，接着玩下去。",
    "benefits": [
      "创建或导入世界，整理角色、世界书和常用设定。",
      "查看故事进展，查找聊天记录和备份。",
      "协助调整酒馆模型、外观及支持的扩展设置。"
    ],
    "prompt": "帮我列出诺拉酒馆里已有的世界。我选定后，再帮我看看故事进展，先不要修改内容。",
    "requirement": "需要先连接诺拉与当前酒馆，只按你的要求修改或删除内容。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/creative/tavern/SKILL.md",
    "sourceLabel": "阅读详细用法 ↗"
  },
  {
    "id": "tavern-ops",
    "category": "日常维护",
    "icon": "tools",
    "title": "使用问题排查",
    "description": "酒馆打不开、连接不上时，帮你找到问题所在。",
    "benefits": [
      "检查酒馆是否启动、诺拉能否连接、入口是否可用。",
      "查看相关状态，说明问题出在哪一步。",
      "需要恢复时，按你的要求处理指定的服务。"
    ],
    "prompt": "酒馆打不开了，帮我检查哪里出了问题，先说明原因，不要重启或重装。",
    "requirement": "检查不会自动重启或重装。需要恢复服务时，会先说明处理方式。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/creative/tavern-ops/SKILL.md",
    "sourceLabel": "阅读详细用法 ↗"
  },
  {
    "id": "tavern-updater",
    "category": "日常维护",
    "icon": "clock",
    "title": "诺拉酒馆更新",
    "description": "看看有没有新版本，需要时再帮你更新。",
    "benefits": [
      "检查当前安装是否有可用更新。",
      "有桌面启动器时，分别检查酒馆与启动器的更新。",
      "查看更新进度，说明哪些已完成、哪些还需处理。"
    ],
    "prompt": "帮我看看诺拉酒馆有没有新版本，告诉我可以更新什么，先不要开始更新。",
    "requirement": "能否更新取决于当前安装版本，旧版可能需要先接入更新功能。更新时诺拉可能短暂离线。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/system/tavern-updater/SKILL.md",
    "sourceLabel": "阅读详细用法 ↗"
  },
  {
    "id": "model-provider-config",
    "category": "日常维护",
    "icon": "settings",
    "title": "诺拉模型设置",
    "description": "设置或更换诺拉使用的 AI 模型。",
    "benefits": [
      "根据你选择的服务商、模型和 API Key 保存设置。",
      "使用自定义模型服务时，帮你核对需要填写的信息。",
      "只改诺拉的模型，保留酒馆和其他模型设置。"
    ],
    "prompt": "我想换一个模型给诺拉使用。先告诉我需要提供哪些信息，只改诺拉，不修改酒馆里的模型。",
    "requirement": "适用于支持此功能的本地安装。保存后在新对话中生效；保存成功不等于连接测试通过。",
    "delivery": "bundled",
    "sourceURL": "https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/system/model-provider-config/SKILL.md",
    "sourceLabel": "阅读详细用法 ↗"
  }
];
