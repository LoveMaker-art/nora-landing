const ORIGINS = new Set(['https://noratavern.com', 'https://lovemaker-art.github.io']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = {
 download_click: ['windows','mac-arm64','mac-x64'],
 help_open: ['installation','faq-relationship','faq-next','faq-failure'],
 link_click: ['clawchat','pairing','install-guide','github-fallback','source'],
 installer_resolve: ['installers']
};
const DAY = 86400000;
const enc = new TextEncoder();
function json(data, status=200, extra={}) {return new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
function dateMs(s) {if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN; const n=Date.parse(s+'T00:00:00+08:00');return Number.isFinite(n)&&new Date(n+8*3600000).toISOString().slice(0,10)===s?n:NaN;}
async function secretMatches(a,b) {if(!a||!b)return false;const [x,y]=await Promise.all([a,b].map(v=>crypto.subtle.digest('SHA-256',enc.encode(v))));return new Uint8Array(x).reduce((v,c,i)=>v|(c^new Uint8Array(y)[i]),0)===0;}
async function visitorHash(id,secret) {const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=await crypto.subtle.sign('HMAC',key,enc.encode(id));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
async function readBody(request) {if(!request.body)throw new Error('body');const reader=request.body.getReader();let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new Error('size');}chunks.push(value);}const all=new Uint8Array(size);let i=0;for(const c of chunks){all.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(all));}
function validEvent(b,origin) {
 if(!b||typeof b.event_id!=='string'||typeof b.visitor_id!=='string'||!UUID.test(b.event_id)||!UUID.test(b.visitor_id)||!ORIGINS.has(origin))return false;
 if(b.hostname!==new URL(origin).hostname)return false;
 if(b.event==='pageview'){if(b.action||b.platform||b.result)return false;}
 else if(!Array.isArray(ALLOWED[b.event])||!ALLOWED[b.event].includes(b.action))return false;
 if(b.event==='download_click' && (b.platform!==b.action || !['direct','fallback'].includes(b.result)))return false;
 if(['help_open','link_click'].includes(b.event) && (b.platform||b.result))return false;
 if(b.event==='installer_resolve' && b.platform)return false;
 if(b.event==='installer_resolve' && !['latest','previous_complete','http_error','timeout','network_error','no_complete_release','invalid_response'].includes(b.result))return false;
 if(!['','windows','mac-arm64','mac-x64'].includes(b.platform||''))return false;
 if(!['desktop','mobile','tablet','unknown'].includes(b.device))return false;
 if(typeof b.channel!=='string'||! /^[a-zA-Z0-9_.-]{1,80}$/.test(b.channel))return false;
 return true;
}
async function collect(request,env) {
 const origin=request.headers.get('Origin');if(!ORIGINS.has(origin))return json({error:'origin_not_allowed'},403);
 const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin'};
 const ip=request.headers.get('CF-Connecting-IP');
 if(ip && env.EVENT_RATE_LIMITER && !(await env.EVENT_RATE_LIMITER.limit({key:ip})).success)return json({error:'rate_limited'},429,cors);
 if(!env.DB||!env.VISITOR_HASH_SECRET)return json({error:'not_configured'},503,cors);
 let b;try{b=await readBody(request);}catch{return json({error:'invalid_body'},400,cors);}
 if(!validEvent(b,origin))return json({error:'invalid_event'},400,cors);
 // Only a fixed, low-cardinality set of fields is persisted. No raw URLs, IPs or keys.
 const id=await visitorHash(b.visitor_id,env.VISITOR_HASH_SECRET);
 await env.DB.prepare('INSERT OR IGNORE INTO events(event_id,visitor_id,occurred_at,event,action,platform,result,channel,device,hostname) VALUES(?,?,?,?,?,?,?,?,?,?)')
 .bind(b.event_id,id,Date.now(),b.event,b.action||'',b.platform||'',b.result||'',b.channel,b.device,b.hostname).run();
 return json({accepted:true},202,cors);
}
async function stats(request,env) {
 if(!env.STATS_READ_KEY||!await secretMatches(request.headers.get('Authorization'),`Bearer ${env.STATS_READ_KEY}`))return json({error:'unauthorized'},401);
 if(!env.DB)return json({error:'not_configured'},503);
 const u=new URL(request.url),from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';
 const start=dateMs(from),end=dateMs(to)+DAY;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>93*DAY)return json({error:'invalid_range',message:'Use from/to YYYY-MM-DD, inclusive, at most 93 days (Asia/Shanghai).'},400);
 const bindings=[start,end];let where='occurred_at >= ? AND occurred_at < ?';
 for(const key of ['channel','hostname']) {const value=u.searchParams.get(key);if(value){if(!/^[a-zA-Z0-9_.-]{1,80}$/.test(value))return json({error:'invalid_filter'},400);where+=` AND ${key} = ?`;bindings.push(value);}}
 const q=sql=>env.DB.prepare(sql).bind(...bindings);
 const [summary,daily,events,actions]=await env.DB.batch([
 q(`SELECT COUNT(CASE WHEN event='pageview' THEN 1 END) AS pv, COUNT(DISTINCT CASE WHEN event='pageview' THEN visitor_id END) AS uv, COUNT(CASE WHEN event='download_click' THEN 1 END) AS download_clicks, COUNT(DISTINCT CASE WHEN event='download_click' THEN visitor_id END) AS download_visitors FROM events WHERE ${where}`),
 q(`SELECT date(occurred_at/1000,'unixepoch','+8 hours') AS date, COUNT(CASE WHEN event='pageview' THEN 1 END) AS pv, COUNT(DISTINCT CASE WHEN event='pageview' THEN visitor_id END) AS uv, COUNT(CASE WHEN event='download_click' THEN 1 END) AS download_clicks, COUNT(DISTINCT CASE WHEN event='download_click' THEN visitor_id END) AS download_visitors FROM events WHERE ${where} GROUP BY date ORDER BY date`),
 q(`SELECT event,action,platform,result,COUNT(*) AS count,COUNT(DISTINCT visitor_id) AS visitors FROM events WHERE ${where} GROUP BY event,action,platform,result ORDER BY event,action,platform,result`),
 q(`SELECT event,action,platform,COUNT(*) AS count,COUNT(DISTINCT visitor_id) AS visitors FROM events WHERE ${where} GROUP BY event,action,platform ORDER BY event,action,platform`)
 ]);
 const days=new Map(daily.results.map(r=>[r.date,r]));const filled=[];
 for(let n=start;n<end;n+=DAY){const date=new Date(n+8*3600000).toISOString().slice(0,10);filled.push(days.get(date)||{date,pv:0,uv:0,download_clicks:0,download_visitors:0});}
 return json({schema_version:1,timezone:'Asia/Shanghai',from,to,generated_at:new Date().toISOString(),identity:'anonymous_browser_per_origin',summary:summary.results[0],daily:filled,events:events.results,actions:actions.results,unavailable:{create_click_visitors:{value:null,status:'entry_removed'},create_success_users:{value:null,status:'not_integrated'},install_success_devices:{value:null,status:'not_integrated'}}});
}
export default {async fetch(request,env) {
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 try {
  if(url.pathname==='/api/events'&&request.method==='OPTIONS') {const origin=request.headers.get('Origin');return ORIGINS.has(origin)?new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'3600'}}):json({error:'origin_not_allowed'},403);}
  if(url.pathname==='/api/events'&&request.method==='POST')return await collect(request,env);
  if(url.pathname==='/api/stats'&&request.method==='GET')return await stats(request,env);
  return json({error:'not_found'},404);
 }catch{return json({error:'temporarily_unavailable'},503);}
}};
