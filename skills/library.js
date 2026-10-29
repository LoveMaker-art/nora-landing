/* Read-only catalogue. Downloads are static files; no skill is executed by this page. */
import skills from './catalogue.js';
import {downloadCandidates,fetchSkillPackage} from './downloads.js';
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
  const grid=document.getElementById('skill-grid'), search=document.getElementById('skill-search');
  const dialog=document.getElementById('skill-dialog'), copyButton=document.getElementById('copy-prompt');
  let category='全部',selected=null,opener=null;
  const localPreview=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  const downloadOptions={localPreview,baseUrl:location.href};
  async function downloadPackage(event,skill,link,status){
    event.preventDefault();if(link.getAttribute('aria-busy')==='true')return;
    link.setAttribute('aria-busy','true');status.textContent='正在准备下载…';
    try{
      const {bytes}=await fetchSkillPackage(skill,downloadOptions);
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
      const a=document.createElement('a');a.href=url;a.download=skill.package.split('/').pop();document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent='已发起下载，请在浏览器的下载列表中查看。';
    }catch(error){status.textContent=error.message;}finally{link.removeAttribute('aria-busy');}
  }
  const packageLink=document.getElementById('detail-download');
  packageLink.addEventListener('click',event=>downloadPackage(event,selected,packageLink,document.getElementById('detail-download-status')));
  const escapeHtml=value=>String(value).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  function render(){
    const query=search.value.trim().toLocaleLowerCase();
    const filtered=skills.filter(s=>(category==='全部'||s.category===category)&&[s.id,s.title,s.category,s.description,...s.benefits].join(' ').toLocaleLowerCase().includes(query));
    grid.innerHTML=filtered.map(s=>`<article class="skill-card"><div class="skill-card-top"><div class="skill-icon">${svg(icons[s.icon])}</div><span class="skill-category">${escapeHtml(s.category)}</span></div><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.description)}</p><div class="skill-card-bottom"><span class="skill-type">${s.delivery==='download'?'需要安装':'诺拉自带'}</span><button class="skill-open" type="button" data-skill="${escapeHtml(s.id)}" aria-label="查看${escapeHtml(s.title)}技能详情">${s.delivery==='download'?'查看并下载':'查看用法'} ${svg('<path d="M5 12h14m-5-5 5 5-5 5"/>')}</button></div></article>`).join('');
    document.getElementById('result-count').textContent=`${filtered.length} 项技能`;
    document.getElementById('library-empty').hidden=filtered.length>0;
    grid.hidden=filtered.length===0;
    document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
  }
  function openDetail(id,button){
    selected=skills.find(s=>s.id===id);opener=button;
    document.getElementById('detail-icon').innerHTML=svg(icons[selected.icon]);
    document.getElementById('detail-category').textContent=selected.category+' · '+(selected.delivery==='download'?'需要安装':'诺拉自带');
    document.getElementById('detail-requirement').textContent=selected.requirement;
    document.getElementById('detail-source').href=selected.sourceURL;
    document.getElementById('detail-source').textContent=selected.sourceLabel;
    const downloadable=selected.delivery==='download';
    document.getElementById('detail-package').hidden=!downloadable;
    if(downloadable){
      const link=document.getElementById('detail-download');
      link.href=downloadCandidates(selected,downloadOptions)[0];
      document.getElementById('detail-download-status').textContent='';
      link.download=selected.package.split('/').pop();
      link.textContent='下载技能';
      document.getElementById('package-info').textContent='压缩文件 · '+(selected.bytes/1024).toFixed(1)+' KB';
      document.getElementById('package-hash').textContent=selected.sha256;
      const setup=document.getElementById('detail-setup');
      setup.hidden=!selected.setupURL;
      if(selected.setupURL)setup.href=selected.setupURL;
    }
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
