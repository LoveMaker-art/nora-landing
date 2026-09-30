/* First-party, anonymous browser analytics. Never blocks navigation. */
(() => {
 'use strict';
 const root=document.getElementById('nora-original-matched');
 if(!root||root.dataset.analyticsInitialized)return;
 root.dataset.analyticsInitialized='true';
 if(!['noratavern.com','lovemaker-art.github.io'].includes(location.hostname))return;
 const endpoint='https://noratavern.com/api/events';
 const uuid=()=>crypto.randomUUID();
 let visitor;
 try {visitor=localStorage.getItem('nora_visitor_v1');if(!/^[0-9a-f-]{36}$/i.test(visitor||'')){visitor=uuid();localStorage.setItem('nora_visitor_v1',visitor);}}catch{visitor=uuid();}
 const ua=navigator.userAgent;
 const device=/iPad|Tablet/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'tablet':/Mobi|Android/i.test(ua)?'mobile':'desktop';
 const validChannel=s=>/^[a-zA-Z0-9_.-]{1,80}$/.test(s||'');
 let channel=new URL(location.href).searchParams.get('utm_source');
 if(!validChannel(channel)) {try {channel=document.referrer?new URL(document.referrer).hostname:'direct';}catch{channel='direct';}}
 if(!validChannel(channel))channel='other';
 // One storage key per event prevents concurrent tabs from overwriting a shared queue.
 const prefix='nora_event_v2_',ttl=7*86400000,limit=200;
 const pending=new Map();let sending=false,timer,delay=1500;
 function remove(id){pending.delete(id);try{localStorage.removeItem(prefix+id);}catch{}}
 function restore(){try{
  const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(prefix))keys.push(k);}
  for(const k of keys){try{const b=JSON.parse(localStorage.getItem(k));if(!b||!b.event_id||!Number.isFinite(b.occurred_at)||Date.now()-b.occurred_at>ttl){localStorage.removeItem(k);continue;}pending.set(b.event_id,b);}catch{localStorage.removeItem(k);}}
 }catch{}}
 function trim(){for(const [id,b] of pending)if(Date.now()-b.occurred_at>ttl)remove(id);
  const ordered=[...pending.values()].sort((a,b)=>a.occurred_at-b.occurred_at);while(ordered.length>limit)remove(ordered.shift().event_id);
 }
 function schedule(){if(!timer)timer=setTimeout(()=>{timer=null;flush();},delay);}
 async function flush(){
  if(sending)return;restore();trim();if(!pending.size)return;sending=true;
  try{for(const [id,b] of pending){
   let response;try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(b),keepalive:true,credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});}catch{break;}
   if(response.status===202||[400,403,413].includes(response.status)){remove(id);delay=1500;}else break;
  }}finally{sending=false;if(pending.size){schedule();delay=Math.min(delay*2,60000);}}
 }
 function track(event,data={}) {
  const b={event_id:uuid(),visitor_id:visitor,event,hostname:location.hostname,channel,device,occurred_at:Date.now(),...data};
  pending.set(b.event_id,b);try{localStorage.setItem(prefix+b.event_id,JSON.stringify(b));}catch{}trim();flush();
 }
 window.addEventListener('online',()=>{delay=1500;flush();});
 window.addEventListener('pageshow',()=>flush());
 window.addEventListener('nora:download-outcome',event=>{
  const d=event.detail;if(!d||!['download_ready','download_failed'].includes(d.event)||!['windows','mac-arm64','mac-x64'].includes(d.platform))return;
  track(d.event,{action:d.platform,platform:d.platform,result:d.result});
 });
 track('pageview'); // One per document load; anchor navigation is not a new view.
 window.addEventListener('pageshow',event=>{if(event.persisted)track('pageview');});
 root.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;if(!target)return;
  const installer=target.closest('[data-installer]');
  if(installer){const platform=installer.dataset.installer;track('download_click',{action:platform,platform,result:'click'});return;}
  const mappings=[['[data-local-im]','clawchat'],['[data-pairing]','pairing'],['.local-links a[href*="docs/install-nora-tavern.md"]','install-guide'],['#installer-release','github-fallback'],['.source-link, footer a[href="https://github.com/LoveMaker-art/noras-tavern"]','source']];
  for(const [selector,action] of mappings)if(target.closest(selector)){track('link_click',{action});break;}
 },true);
 const trackedDetails=[...root.querySelectorAll('.local-help, .faq-list details')];
 const names=['installation','faq-relationship','faq-next','faq-failure'];
 trackedDetails.forEach((node,i)=>node.addEventListener('toggle',()=>{if(node.open)track('help_open',{action:names[i]});}));
})();
