/* Keep the landing page open; only the server chooses and checks release assets. */
(() => {
 'use strict';
 const status=document.getElementById('installer-status');
 const retry=document.getElementById('installer-retry');
 const links=[...document.querySelectorAll('[data-installer]')];
 if(!status||!retry||!links.length)return;
 let selected, busy=false, cooldown;
 const frame=document.createElement('iframe');frame.hidden=true;frame.title='安装包下载';frame.referrerPolicy='no-referrer';document.body.append(frame);
 const names={windows:'Windows','mac-arm64':'Mac Apple 芯片','mac-x64':'Mac Intel'};
 function lock(value){busy=value;for(const link of links){if(value)link.setAttribute('aria-disabled','true');else link.removeAttribute('aria-disabled');}retry.disabled=value;}
 async function start(platform,force=false){
  if(busy)return;selected=platform;clearTimeout(cooldown);lock(true);retry.hidden=true;
  status.textContent=`正在准备 ${names[platform]} 安装包…`;
  try {
   const u=new URL(links.find(a=>a.dataset.installer===platform).href);u.searchParams.set('format','json');if(force)u.searchParams.set('retry','1');
   const response=await fetch(u.href,{signal:AbortSignal.timeout(25000),cache:'no-store',credentials:'omit'});
   const data=await response.json();
   if(!response.ok){const e=new Error(data.error);e.retryAfter=data.retryAfter;throw e;}
   const target=new URL(data.url);
   const suffix={windows:'-win-x64-setup.exe','mac-arm64':'-mac-arm64.dmg','mac-x64':'-mac-x64.dmg'}[platform];
   if(target.origin!=='https://github.com'||!target.pathname.startsWith('/LoveMaker-art/noras-tavern/releases/download/')||!target.pathname.endsWith(suffix))throw new Error('invalid_download');
   frame.src=target.href;
   status.textContent='已发起下载。没有开始？可重新下载；若仍无响应，请检查 GitHub 是否可以访问。';
   retry.textContent='重新下载';retry.hidden=false;lock(false);
  }catch(error){
   const seconds=Math.min(30,Math.max(0,Number(error.retryAfter)||0));
   status.textContent=error.message==='check_cooldown'?`正在检查或刚刚检查过，请 ${seconds} 秒后重试。`:'暂时无法获取安装包，请稍后重试。';
   retry.textContent='重新检查下载';retry.hidden=false;lock(false);
   if(seconds){retry.disabled=true;cooldown=setTimeout(()=>{retry.disabled=false;},seconds*1000);}
  }
 }
 for(const link of links)link.addEventListener('click',event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();start(link.dataset.installer);
 });
 retry.addEventListener('click',()=>{if(selected)start(selected,true);});
})();
