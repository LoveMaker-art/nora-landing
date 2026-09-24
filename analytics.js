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
 function track(event,data={}) {
  const body=JSON.stringify({event_id:uuid(),visitor_id:visitor,event,hostname:location.hostname,channel,device,...data});
  function send(retry){fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body,keepalive:true,credentials:'omit',referrerPolicy:'no-referrer'})
   .then(r=>{if(r.status>=500&&retry)setTimeout(()=>send(false),1500);}).catch(()=>{if(retry)setTimeout(()=>send(false),1500);});}
  try{send(true);}catch{} // Keep the same event_id on retry, for server deduplication.
 }
 track('pageview'); // One per document load; anchor navigation is not a new view.
 window.addEventListener('pageshow',event=>{if(event.persisted)track('pageview');});
 window.addEventListener('nora:installer-result',event=>{track('installer_resolve',{action:'installers',result:event.detail.result});});
 root.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;if(!target)return;
  const installer=target.closest('[data-installer]');
  if(installer){const platform=installer.dataset.installer;track('download_click',{action:platform,platform,result:installer.dataset.downloadFallback==='true'?'fallback':'direct'});return;}
  const mappings=[['[data-local-im]','clawchat'],['[data-pairing]','pairing'],['.local-links a[href*="docs/install-nora-tavern.md"]','install-guide'],['#installer-release','github-fallback'],['.source-link, footer a[href="https://github.com/LoveMaker-art/noras-tavern"]','source']];
  for(const [selector,action] of mappings)if(target.closest(selector)){track('link_click',{action});break;}
 },true);
 const trackedDetails=[...root.querySelectorAll('.local-help, .faq-list details')];
 const names=['installation','faq-relationship','faq-next','faq-failure'];
 trackedDetails.forEach((node,i)=>node.addEventListener('toggle',()=>{if(node.open)track('help_open',{action:names[i]});}));
})();
