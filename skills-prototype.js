/* Catalogue checked against LoveMaker-art/noras-tavern main c65d44b on 2026-10-23. This page does not execute or install skills. */
(() => {
  const icons = {
    person: '<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2M19 4v4m-2-2h4"/>',
    speech: '<path d="M20 11a7 7 0 0 1-7 7H8l-5 3V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v4Z"/><path d="M7 9h9M7 13h6"/>',
    world: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5a15 15 0 0 0 14 0M5 17.5a15 15 0 0 1 14 0"/>',
    story: '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2V5Zm0 13a2 2 0 0 1 2-2h13M8 7h7M8 11h5"/>',
    cards: '<rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 6H3v15h13M11 8h5M11 12h5M11 16h3"/>',
    tools: '<path d="M14 6a5 5 0 0 0-6 6L3 17a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="#f6f2fb"/><circle cx="15" cy="17" r="3" fill="#f6f2fb"/>',
    clock: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>'
  };
  const skills = [
  {
    "id": "nora-cardforge",
    "category": "内容创作",
    "icon": "cards",
    "title": "世界卡制作",
    "description": "制作世界卡，评估和润色已有卡，整理成可交付文件。",
    "path": "creative/nora-cardforge",
    "benefits": [
      "从角色、世界观和玩法出发制作世界卡，按需加入世界书、MVU、正则与状态栏。",
      "检查已有卡的内容和结构；按你的要求润色文案，保留原有玩法。",
      "构建并导出 JSON 或带封面的 PNG；需要导入时再交接到酒馆。"
    ],
    "prompt": "帮我制作一张雨夜酒馆的世界卡，老板是一位退休赏金猎人。先和我确定角色、世界观和玩法，再制作成品，暂不导入酒馆。",
    "requirement": "制作文件与导入酒馆是两个步骤；导入需要已连接的酒馆与 Nora MCP。"
  },
  {
    "id": "tavern",
    "category": "酒馆管理",
    "icon": "world",
    "title": "酒馆管理",
    "description": "管理世界、角色和资料库，也能检查剧情进展与设定。",
    "path": "creative/tavern",
    "benefits": [
      "创建或导入世界，管理角色、玩家身份、世界书与提示词预设。",
      "查看指定世界的剧情进展，管理会话、聊天备份和剧情账本。",
      "协助配置酒馆模型、外观及受支持的插件，查看故事档案。"
    ],
    "prompt": "帮我查看酒馆里有哪些世界，列出名称。我选定后，再帮我看看那个世界的剧情进展，先不要修改内容。",
    "requirement": "需要连接当前酒馆的 Nora MCP；修改、删除及模型调用按你的具体授权执行。"
  },
  {
    "id": "tavern-ops",
    "category": "运行维护",
    "icon": "tools",
    "title": "故障诊断",
    "description": "排查酒馆服务、MCP 连接和 Liveware 入口问题。",
    "path": "creative/tavern-ops",
    "benefits": [
      "分开检查酒馆服务、诺拉与酒馆的 MCP 连接，以及外部入口。",
      "查看相关状态和日志，定位失败环节及仍缺少的证据。",
      "在明确授权后，使用现有维护流程恢复指定实例。"
    ],
    "prompt": "酒馆入口打不开，帮我检查当前实例的服务和连接状态，说明问题在哪一层，先不要重启或重装。",
    "requirement": "诊断不等于自动修复；重启、恢复或配置修改需要明确授权。"
  },
  {
    "id": "tavern-updater",
    "category": "运行维护",
    "icon": "clock",
    "title": "版本更新",
    "description": "检查适用的新版本，按你的要求更新并核对结果。",
    "path": "system/tavern-updater",
    "benefits": [
      "先检查当前安装适用的更新，不因查询版本自动启动更新。",
      "支持的桌面安装可按顺序更新酒馆和启动器；云端或源码实例使用核心更新流程。",
      "检查任务进度与实际更新结果，区分完成、部分完成和失败恢复。"
    ],
    "prompt": "帮我检查当前诺拉酒馆有没有可用更新，告诉我适用的更新内容，先不要执行更新。",
    "requirement": "是否支持更新取决于当前安装与更新入口；旧版可能需要先迁移。更新期间诺拉可能短暂断开。"
  },
  {
    "id": "model-provider-config",
    "category": "运行维护",
    "icon": "settings",
    "title": "诺拉模型配置",
    "description": "配置或切换本地诺拉的模型服务商、模型与 API Key。",
    "path": "system/model-provider-config",
    "benefits": [
      "根据你提供的服务商、模型和 API Key 保存本地诺拉的默认模型配置。",
      "支持内置服务商与自定义 OpenAI 兼容接口；自定义接口需提供 Base URL。",
      "只修改诺拉模型，保留酒馆模型、MVU 模型和其他实例的配置。"
    ],
    "prompt": "我想切换本地诺拉使用的模型。请先告诉我需要提供哪些信息，只改诺拉，不修改酒馆和 MVU 模型。",
    "requirement": "仅适用于受支持的本地启动器实例；保存后新会话生效，配置保存不代表 API 已验证。"
  }
];
  const grid=document.getElementById('skill-grid'), search=document.getElementById('skill-search');
  const dialog=document.getElementById('skill-dialog'), copyButton=document.getElementById('copy-prompt');
  let category='全部',selected=null,opener=null;
  const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  function render(){
    const query=search.value.trim().toLocaleLowerCase();
    const filtered=skills.filter(s=>(category==='全部'||s.category===category)&&[s.id,s.title,s.category,s.description,...s.benefits].join(' ').toLocaleLowerCase().includes(query));
    grid.innerHTML=filtered.map(s=>`<article class="skill-card"><div class="skill-card-top"><div class="skill-icon">${svg(icons[s.icon])}</div><span class="skill-category">${s.category}</span></div><h2>${s.title}</h2><p>${s.description}</p><div class="skill-card-bottom"><span class="skill-type">${s.id}</span><button class="skill-open" type="button" data-skill="${s.id}" aria-label="查看${s.title}技能详情">查看技能 ${svg('<path d="M5 12h14m-5-5 5 5-5 5"/>')}</button></div></article>`).join('');
    document.getElementById('result-count').textContent=`${filtered.length} 项技能`;
    document.getElementById('library-empty').hidden=filtered.length>0;
    grid.hidden=filtered.length===0;
    document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
  }
  function openDetail(id,button){
    selected=skills.find(s=>s.id===id);opener=button;
    document.getElementById('detail-icon').innerHTML=svg(icons[selected.icon]);
    document.getElementById('detail-category').textContent=selected.category+' · '+selected.id;
    document.getElementById('detail-requirement').textContent=selected.requirement;
    document.getElementById('detail-source').href='https://github.com/LoveMaker-art/noras-tavern/blob/main/nora/skills/'+selected.path+'/SKILL.md';
    document.getElementById('detail-title').textContent=selected.title;
    document.getElementById('detail-description').textContent=selected.description;
    document.getElementById('detail-benefits').replaceChildren(...selected.benefits.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    document.getElementById('detail-prompt').textContent=selected.prompt;
    document.getElementById('copy-feedback').textContent='';
    dialog.showModal();dialog.scrollTop=0;document.body.style.overflow='hidden';
  }
  search.addEventListener('input',render);
  document.querySelector('.library-search').addEventListener('submit',event=>event.preventDefault());
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;render();}));
  document.getElementById('clear-filters').addEventListener('click',()=>{category='全部';search.value='';render();search.focus();});
  grid.addEventListener('click',event=>{const b=event.target.closest('[data-skill]');if(b)openDetail(b.dataset.skill,b);});
  document.getElementById('close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{document.body.style.overflow='';opener?.focus();});
  copyButton.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(selected.prompt);document.getElementById('copy-feedback').textContent='已复制';}
    catch{const range=document.createRange();range.selectNodeContents(document.getElementById('detail-prompt'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.getElementById('copy-feedback').textContent='已选中，请手动复制';}
  });
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!dialog.open&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.matches('input,textarea,[contenteditable]')){event.preventDefault();search.focus();}});
  render();
})();
