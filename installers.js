/* Download feedback belongs to the selected platform card, not another CTA. */
(() => {
 'use strict';
 const status=document.getElementById('installer-status');
 const links=[...document.querySelectorAll('[data-installer]')];
 if(!status||!links.length)return;
 const names={windows:'Windows','mac-arm64':'Mac Apple 芯片','mac-x64':'Mac Intel'};
 const cards=new Map(links.map(link=>{
  link.setAttribute('aria-describedby','installer-status');
  return [link.dataset.installer,{link,attempted:false,remaining:0}];
 }));
 const frame=document.createElement('iframe');frame.hidden=true;frame.title='安装包下载';frame.referrerPolicy='no-referrer';document.body.append(frame);
 let busy=false,selected;
 function render(card,state){
  if(state==='pending')card.link.setAttribute('aria-busy','true');else card.link.removeAttribute('aria-busy');
 }
 function controls(){for(const card of cards.values()){
  if(busy||card.remaining>0)card.link.setAttribute('aria-disabled','true');else card.link.removeAttribute('aria-disabled');
 }}
 function say(text){status.textContent=text;}
 function countdown(card){
  if(selected===card){
   say(card.remaining>0?`暂时无法开始 ${names[card.link.dataset.installer]} 下载，请 ${card.remaining} 秒后再次点击原下载按钮。`:`暂时无法开始 ${names[card.link.dataset.installer]} 下载，请再次点击原下载按钮。`);
  }
  controls();
  if(card.remaining>0)setTimeout(()=>{card.remaining--;countdown(card);},1000);
 }
 function report(event,platform,result){try{window.dispatchEvent(new CustomEvent('nora:download-outcome',{detail:{event,platform,result}}));}catch{}}
 async function start(platform){
  const card=cards.get(platform);if(busy||card.remaining>0)return;
  selected=card;const force=card.attempted;card.attempted=true;busy=true;render(card,'pending');controls();
  say(`正在准备 ${names[platform]} 安装包，请稍候。`);
  try {
   const u=new URL(card.link.href);u.searchParams.set('format','json');if(force)u.searchParams.set('retry','1');
   const response=await fetch(u.href,{signal:AbortSignal.timeout(25000),cache:'no-store',credentials:'omit'});
   const data=await response.json();
   if(!response.ok){const e=new Error(data.error);e.status=response.status;e.retryAfter=data.retryAfter;throw e;}
   const target=new URL(data.url);
   const suffix={windows:'-win-x64-setup.exe','mac-arm64':'-mac-arm64.dmg','mac-x64':'-mac-x64.dmg'}[platform];
   const root=target.origin==='https://github.com'?'/LoveMaker-art/noras-tavern/releases/download/'
    :target.origin==='https://downloads.sourceforge.net'?'/project/nora-tavern/':null;
   const [tag,name,...rest]=root?target.pathname.slice(root.length).split('/'):[];
   if(!root||!target.pathname.startsWith(root)||target.username||target.password||target.search||target.hash
    ||rest.length||!/^v\d+\.\d+\.\d+$/.test(tag)||!new RegExp('^Nora-Tavern-Launcher-\\d+\\.\\d+\\.\\d+'+suffix.replaceAll('.','\\.')+'$').test(name))throw new Error('invalid_download');
   frame.src=target.href;report('download_ready',platform,'ready');render(card,'idle');
   say(`已发起 ${names[platform]} 下载，请查看浏览器下载列表。`);
  }catch(error){
   const reason=error.status===429?'rate_limited':error.status?'http_error':error.name==='TimeoutError'||error.name==='AbortError'?'timeout':error.message==='invalid_download'||error instanceof SyntaxError?'invalid_response':'network_error';
   report('download_failed',platform,reason);
   card.remaining=Math.min(30,Math.max(0,Math.ceil(Number(error.retryAfter)||0)));
   render(card,'idle');countdown(card);
  }finally{busy=false;controls();}
 }
 for(const link of links)link.addEventListener('click',event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();start(link.dataset.installer);
 });
})();
