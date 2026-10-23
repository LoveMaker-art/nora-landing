/* Local design sample data. None of these entries installs or downloads a skill. */
(() => {
  const icons = {
    person: '<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2M19 4v4m-2-2h4"/>',
    speech: '<path d="M20 11a7 7 0 0 1-7 7H8l-5 3V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v4Z"/><path d="M7 9h9M7 13h6"/>',
    world: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5a15 15 0 0 0 14 0M5 17.5a15 15 0 0 1 14 0"/>',
    story: '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2V5Zm0 13a2 2 0 0 1 2-2h13M8 7h7M8 11h5"/>',
    cards: '<rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 6H3v15h13M11 8h5M11 12h5M11 16h3"/>',
    clock: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>'
  };
  const skills = [
    {id:'character',category:'角色创作',icon:'person',title:'角色设定',description:'从几个关键词，补全人物的性格与经历。',benefits:['梳理人物背景、动机与关系。','整理可用于角色扮演的设定。'],prompt:'帮我构思一位退休的赏金猎人。他在雨夜酒馆当老板，不爱说话，却记得每个客人的习惯。'},
    {id:'voice',category:'角色创作',icon:'speech',title:'角色对白',description:'让台词带上角色自己的语气和习惯。',benefits:['提炼角色的说话方式与口头习惯。','为同一场景尝试不同情绪的对白。'],prompt:'帮我打磨这位酒馆老板的说话方式：寡言、略带讽刺，关心客人时也不直说。给我三段对白示例。'},
    {id:'world',category:'世界构建',icon:'world',title:'世界设定',description:'把一个灵感，展开成有细节的世界。',benefits:['补全地点、势力与世界规则。','建立能为剧情提供冲突的背景。'],prompt:'帮我构建雨夜酒馆所在的边境小城，设定三个势力，以及他们之间尚未解决的矛盾。'},
    {id:'plot',category:'世界构建',icon:'story',title:'剧情灵感',description:'为卡住的故事，找到下一个转折。',benefits:['基于已有设定，提出后续剧情方向。','设计让角色面临选择的故事节点。'],prompt:'一个老板以为早已死去的老朋友走进酒馆。给我三个不同的剧情方向，每个方向都留一个需要我决定的选择。'},
    {id:'organize',category:'酒馆管理',icon:'cards',title:'角色卡整理',description:'整理人物资料，让角色设定一目了然。',benefits:['归纳角色资料中零散的设定。','找出矛盾或仍待补充的信息。'],prompt:'帮我检查这份角色设定，按背景、性格、关系和说话方式整理，并标出互相矛盾或需要补充的地方。'},
    {id:'recap',category:'酒馆管理',icon:'clock',title:'故事回顾',description:'梳理已发生的剧情，继续上一次的故事。',benefits:['归纳剧情进展、人物关系与关键选择。','整理尚未解决的线索和约定。'],prompt:'帮我回顾这段故事，整理重要事件、人物关系的变化，以及下次继续时需要记住的线索。'}
  ];
  const grid=document.getElementById('skill-grid'), search=document.getElementById('skill-search');
  const dialog=document.getElementById('skill-dialog'), copyButton=document.getElementById('copy-prompt');
  let category='全部',selected=null,opener=null;
  const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  function render(){
    const query=search.value.trim().toLocaleLowerCase();
    const filtered=skills.filter(s=>(category==='全部'||s.category===category)&&[s.title,s.category,s.description,...s.benefits].join(' ').toLocaleLowerCase().includes(query));
    grid.innerHTML=filtered.map(s=>`<article class="skill-card"><div class="skill-card-top"><div class="skill-icon">${svg(icons[s.icon])}</div><span class="skill-category">${s.category}</span></div><h2>${s.title}</h2><p>${s.description}</p><div class="skill-card-bottom"><span class="skill-type">示例技能</span><button class="skill-open" type="button" data-skill="${s.id}" aria-label="查看${s.title}技能详情">查看技能 ${svg('<path d="M5 12h14m-5-5 5 5-5 5"/>')}</button></div></article>`).join('');
    document.getElementById('result-count').textContent=`${filtered.length} 个示例技能`;
    document.getElementById('library-empty').hidden=filtered.length>0;
    grid.hidden=filtered.length===0;
    document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
  }
  function openDetail(id,button){
    selected=skills.find(s=>s.id===id);opener=button;
    document.getElementById('detail-icon').innerHTML=svg(icons[selected.icon]);
    document.getElementById('detail-category').textContent=selected.category;
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
