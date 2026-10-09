import seed from './installer-seed.json' with {type:'json'};
const BASE='https://github.com/LoveMaker-art/noras-tavern/releases/download/';
const API='https://api.github.com/repos/LoveMaker-art/noras-tavern/releases';
const SF_BASE='https://downloads.sourceforge.net/project/nora-tavern/';
const patterns={windows:/^Nora-Tavern-Launcher-[\d.]+-win-x64-setup\.exe$/, 'mac-arm64':/^Nora-Tavern-Launcher-[\d.]+-mac-arm64\.dmg$/, 'mac-x64':/^Nora-Tavern-Launcher-[\d.]+-mac-x64\.dmg$/};
const FRESH=15*60*1000, GRACE=24*60*60*1000, COOLDOWN=30000;
const pendingChecks=new WeakMap();
function valid(platform,asset) {
 if(!asset||!Number.isFinite(Date.parse(asset.published)))return false;
 try {const url=new URL(asset.url),root=asset.url.startsWith(BASE)?BASE:SF_BASE;
  const [tag,name,...rest]=asset.url.slice(root.length).split('/');
  return !url.username&&!url.password&&!url.search&&!url.hash&&asset.url.startsWith(root)
   &&rest.length===0&&/^v\d+\.\d+\.\d+$/.test(tag)&&patterns[platform].test(name);
 }catch{return false;}
}
function mirrorAsset(asset) {return {...asset,url:asset.url.replace(BASE,SF_BASE)};}
export function installerCandidates(releases,platform,{mirror=false}={}) {
 return releases.filter(r=>!r.draft&&!r.prerelease&&/^v\d+\.\d+\.\d+$/.test(r.tag_name))
 .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).flatMap(r=>(r.assets||[])
 .filter(a=>patterns[platform].test(a.name)&&a.state==='uploaded'&&a.size>0&&a.browser_download_url===`${BASE}${r.tag_name}/${a.name}`)
 .map(a=>({url:mirror?a.browser_download_url.replace(BASE,SF_BASE):a.browser_download_url,published:r.published_at}))).filter(a=>valid(platform,a));
}
export function selectInstallers(releases) {
 return Object.fromEntries(Object.keys(patterns).flatMap(p=>{const a=installerCandidates(releases,p)[0];return a?[[p,a]]:[];}));
}
async function row(db,sql,...args){return (await db.prepare(sql).bind(...args).all()).results[0];}
async function save(db,platform,asset,now) {
 await db.prepare('INSERT INTO installer_links(platform,url,published,checked_at) VALUES(?,?,?,?) ON CONFLICT(platform) DO UPDATE SET url=excluded.url,published=excluded.published,checked_at=excluded.checked_at').bind(platform,asset.url,asset.published,now).run();
}
async function readFile(fetcher,url,options) {
 if(!url.startsWith(SF_BASE))return fetcher(url,options);
 const path=new URL(url).pathname;let target=url;
 for(let hop=0;hop<6;hop++) {
  const permitted=value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash
   &&u.pathname===path&&(u.origin==='https://downloads.sourceforge.net'||/^[a-z0-9-]+\.dl\.sourceforge\.net$/.test(u.hostname));};
  if(!permitted(target))throw new Error('invalid_source');
  const r=await fetcher(target,{...options,redirect:'manual'});
  if(r.url&&!permitted(r.url)){await r.body?.cancel();throw new Error('invalid_source');}
  if(![301,302,303,307,308].includes(r.status))return r;
  const location=r.headers.get('Location');await r.body?.cancel();
  if(!location)break;target=new URL(location,target).href;
 }
 throw new Error('invalid_source');
}
async function smallJson(response) {
 const reader=response.body.getReader(),chunks=[];let size=0;
 try {
  while(true) {
   const {done,value}=await reader.read();if(done)break;
   size+=value.length;if(size>1024*1024)throw new Error('invalid_releases');chunks.push(value);
  }
 } catch(error){await reader.cancel().catch(()=>{});throw error;} finally {reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
// Verified addresses remain reusable even when analytics storage is unavailable.
export async function resolveInstaller(env,platform,{force=false,fetcher=fetch,now=Date.now(),cache=globalThis.caches?.default}={}) {
 const key='https://noratavern.com/__nora_cache/installer-v1/'+platform;
 if(cache&&!force)try{
  const response=await cache.match(key),saved=response&&await response.json();
  if(saved&&valid(platform,saved)&&saved.checked_at<=now&&now-saved.checked_at<FRESH)return {url:saved.url,source:'edge_cache'};
 }catch{/* A cache outage falls back to official-source verification. */}
 let pending=cache&&pendingChecks.get(cache);
 if(cache&&!pending){pending=new Map();pendingChecks.set(cache,pending);}
 if(pending?.has(platform))return pending.get(platform);
 const job=(async()=>{
  const result=await checkInstaller(env,platform,{force,fetcher,now});
  if(cache)try{await cache.put(key,Response.json(result,{headers:{'Cache-Control':'public, max-age=900'}}));}catch{}
  return {url:result.url,source:result.source};
 })();
 pending?.set(platform,job);
 try{return await job;}finally{pending?.delete(platform);}
}
// A shared D1 lease bounds retries when storage is available.
async function checkInstaller(env,platform,{force,fetcher,now}) {
 // Storage accelerates resolution; it must not prevent a verified file download.
 let db=env.DB;
 const stored=async operation=>{
  if(!db)return;
  try{return await operation(db);}catch{db=null;console.warn('Installer storage unavailable; verifying official download sources.');}
 };
 const saved=await stored(db=>row(db,'SELECT * FROM installer_links WHERE platform=?',platform));
 const current=valid(platform,saved)?saved:{...seed[platform],checked_at:0};
 const health=await stored(db=>row(db,'SELECT * FROM installer_health WHERE url=?',current.url));
 const recentlyGood=()=>health?.state!=='missing'&&current.checked_at>0&&now-current.checked_at<GRACE;
 if(!force&&recentlyGood()&&now-current.checked_at<FRESH)return {url:current.url,published:current.published,checked_at:current.checked_at,source:'cache'};
 const lease=await stored(db=>db.prepare('INSERT INTO installer_checks(platform,attempted_at) VALUES(?,?) ON CONFLICT(platform) DO UPDATE SET attempted_at=excluded.attempted_at WHERE installer_checks.attempted_at <= ?').bind(platform,now,now-COOLDOWN).run());
 if(lease&&Number(lease.meta?.changes??lease.changes??0)===0) {
  // A retry cannot silently reuse an unchecked address while another check runs.
  if(!force&&recentlyGood())return {url:current.url,published:current.published,checked_at:current.checked_at,source:'recent_cache'};
  const e=new Error('check_cooldown');e.retryAfter=30;throw e;
 }
 const deadline=AbortSignal.timeout(18000),githubDeadline=AbortSignal.timeout(10000);
 const seen=new Map();
 let currentMissing=health?.state==='missing';
 const probe=async asset=>{
  if(seen.has(asset.url))return seen.get(asset.url);
  const known=await stored(db=>row(db,'SELECT * FROM installer_health WHERE url=?',asset.url));
  // Do not resurrect a known deleted file through a seed or another release scan.
  if(known?.state==='missing'&&now-known.checked_at<FRESH){seen.set(asset.url,false);return false;}
  let state='unknown';
  try {
   const signals=[deadline,AbortSignal.timeout(5000)];if(asset.url.startsWith(BASE))signals.push(githubDeadline);
   const r=await readFile(fetcher,asset.url,{method:'HEAD',redirect:'follow',signal:AbortSignal.any(signals)});
   const type=r.headers.get('Content-Type')||'';
   const fileResponse=r.ok&&!/text\/html|application\/json/i.test(type)&&r.headers.get('Content-Length')!=='0';
   state=fileResponse?'healthy':[404,410].includes(r.status)?'missing':'unknown';
  }catch{}
  if(state!=='unknown')await stored(db=>db.prepare('INSERT INTO installer_health(url,state,checked_at) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET state=excluded.state,checked_at=excluded.checked_at').bind(asset.url,state,now).run());
  if(asset.url===current.url&&state==='missing')currentMissing=true;
  seen.set(asset.url,state==='healthy');return state==='healthy';
 };
 let verified,githubFailed=false;
 const primary={...current,url:current.url.replace(SF_BASE,BASE)};
 if(await probe(primary))verified=primary;
 // Search alternatives too: the first matching release can itself contain a dead asset.
 try {
  for(let page=1;page<=3&&!githubDeadline.aborted;page++) {
   const r=await fetcher(`${API}?per_page=100&page=${page}`,{headers:{'User-Agent':'Nora-Landing-Downloads','Accept':'application/vnd.github+json'},signal:AbortSignal.any([deadline,githubDeadline,AbortSignal.timeout(5000)])});
   if(!r.ok)throw new Error('release_query_failed');
   const releases=await smallJson(r);if(!Array.isArray(releases))throw new Error('invalid_releases');
   for(const asset of installerCandidates(releases,platform).slice(0,6)) {
    if(verified&&Date.parse(asset.published)<=Date.parse(verified.published))continue;
    if(await probe(asset)){verified=asset;break;}
    const alternate=mirrorAsset(asset);
    if(await probe(alternate)){verified=alternate;break;}
   }
   if(verified||releases.length<100)break;
  }
  githubFailed=githubDeadline.aborted;
 }catch{githubFailed=true;}
 // GitHub metadata can be throttled independently of its file CDN. Use the
 // published backup catalogue to discover a version; never scrape latest/download.
 if(githubFailed||!verified)try {
  const r=await readFile(fetcher,SF_BASE+'channels/stable.json',{signal:AbortSignal.any([deadline,AbortSignal.timeout(5000)])});
  if(!r.ok)throw new Error('release_query_failed');
  const release=await smallJson(r);
  if(!release||Array.isArray(release)||!Array.isArray(release.assets)
    ||release.assets.some(a=>!/^sha256:[a-f0-9]{64}$/.test(a.digest||'')))throw new Error('invalid_releases');
  for(const asset of installerCandidates([release],platform,{mirror:true})) {
   if(verified&&Date.parse(asset.published)<Date.parse(verified.published))continue;
   if(await probe(asset)){verified=asset;break;}
  }
 }catch{/* An unchecked or partial backup catalogue never creates a download target. */}
 if(verified){await stored(db=>save(db,platform,verified,now));return {...verified,checked_at:now,source:'verified'};}
 if(!currentMissing&&recentlyGood())return {url:current.url,published:current.published,checked_at:current.checked_at,source:'recent_cache'};
 throw new Error('download_unavailable');
}
export async function refreshInstallers(env,fetcher=fetch) {
 // One platform failure must not prevent other platforms from being checked.
 const results=await Promise.allSettled(Object.keys(patterns).map(p=>resolveInstaller(env,p,{force:true,fetcher})));
 results.forEach((r,i)=>{if(r.status==='rejected')console.error('Installer check:',Object.keys(patterns)[i],r.reason.message);});
}
// Resolve the release once, then change only the host if file delivery fails.
// Only the first bytes are read before forwarding: large DMGs are never buffered.
function deliveryError(platform,asset,headers) {
 const data={type:'nora:download-transfer',platform,asset,error:'download_unavailable'};
 const nonce=crypto.randomUUID().replaceAll('-','');
 const script=`const data=${JSON.stringify(data)};if(parent!==window){parent.postMessage(data,'https://noratavern.com');parent.postMessage(data,'https://lovemaker-art.github.io');}`;
 return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>暂时无法下载</title><p>暂时无法获取安装包，请返回下载页面，30秒后再次点击原下载按钮。</p><script nonce="${nonce}">${script}</script></html>`,{
  status:503,headers:{...headers,'Retry-After':'30','Content-Type':'text/html; charset=utf-8',
   'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors https://noratavern.com https://lovemaker-art.github.io`}
 });
}
async function transferInstaller(request,platform,asset,headers,{fetcher=fetch,transferTimeoutMs=8000}={}) {
 const github=asset.url.replace(SF_BASE,BASE),mirror=github.replace(BASE,SF_BASE);
 const name=new URL(github).pathname.split('/').at(-1);
 const range=request.headers.get('Range');
 const parts=range&&/^bytes=(\d*)-(\d*)$/.exec(range);
 if(range&&(!parts||(!parts[1]&&!parts[2])||[parts[1],parts[2]].some(n=>n&&!Number.isSafeInteger(Number(n)))
  ||(parts[1]&&parts[2]&&Number(parts[1])>Number(parts[2]))||(!parts[1]&&Number(parts[2])===0))) {
  return Response.json({error:'invalid_range'},{status:416,headers});
 }
 const sourceHeaders={'Accept-Encoding':'identity',Accept:'application/octet-stream'};
 if(range)sourceHeaders.Range=range;
 else if(request.method==='HEAD')sourceHeaders.Range='bytes=0-0';
 for(const url of [mirror,github]) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new Error('download_timeout')),transferTimeoutMs);
  let reader,response;
  try {
   response=await readFile(fetcher,url,{method:'GET',headers:sourceHeaders,redirect:'follow',signal:AbortSignal.any([request.signal,controller.signal])});
   const type=response.headers.get('Content-Type')||'';
   if(![200,206].includes(response.status)||!/^application\/(octet-stream|x-msdownload|vnd\.microsoft\.portable-executable|x-apple-diskimage|x-download)(?:;|$)/i.test(type)||!response.body)
    throw new Error('invalid_file_response');
   const contentRange=response.headers.get('Content-Range');
   const span=contentRange&&/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
   if(response.status===206&&(!sourceHeaders.Range||!span||Number(span[1])>Number(span[2])||Number(span[2])>=Number(span[3])))throw new Error('invalid_range_response');
   if(response.status===206&&parts) {
    const total=Number(span[3]),start=parts[1]?Number(parts[1]):Math.max(0,total-Number(parts[2]));
    const end=parts[1]?(parts[2]?Math.min(Number(parts[2]),total-1):total-1):total-1;
    if(Number(span[1])!==start||Number(span[2])!==end)throw new Error('invalid_range_response');
   }
   reader=response.body.getReader();
   const first=[];let size=0;
   // A response can have valid headers and fail before its first body chunk.
   const inspectBytes=platform==='windows'?2:64;
   while(size<inspectBytes) {
    const part=await reader.read();if(part.done)break;
    if(part.value.length){first.push(part.value);size+=part.value.length;}
   }
   if(!size)throw new Error('empty_file');
   const advertised=response.headers.get('Content-Length');
   const length=advertised!==null?Number(advertised):span?Number(span[2])-Number(span[1])+1:null;
   if(length!==null&&(!Number.isSafeInteger(length)||length<size||length<=0))throw new Error('invalid_file_length');
   const startsAtZero=response.status===200||Number(span?.[1])===0;
   const prefix=new Uint8Array(Math.min(size,64));let offset=0;
   for(const chunk of first){const portion=chunk.subarray(0,prefix.length-offset);prefix.set(portion,offset);offset+=portion.length;if(offset===prefix.length)break;}
   if(startsAtZero&&/^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b|[\{\[]\s*["\{\[])/i.test(new TextDecoder().decode(prefix)))throw new Error('error_page');
   if(startsAtZero&&platform==='windows'&&request.method!=='HEAD'&&(prefix[0]!==77||(prefix.length>1?prefix[1]!==90:response.status===200)))throw new Error('invalid_executable');
   clearTimeout(timer); // Preparation deadline must not abort a long, healthy transfer.
   const outgoing={...headers,'Content-Type':type,'Content-Disposition':`attachment; filename="${name}"`,
    'X-Nora-Download-Source':url===mirror?'sourceforge':'github'};
   if(length!==null)outgoing['Content-Length']=String(length);
   if(response.headers.has('Accept-Ranges')||response.status===206)outgoing['Accept-Ranges']='bytes';
   if(request.method==='HEAD') {
    if(span)outgoing['Content-Length']=span[3];
    await reader.cancel();controller.abort();
    return new Response(null,{status:200,headers:outgoing});
   }
   if(response.status===206)outgoing['Content-Range']=contentRange;
   let body=new ReadableStream({
    async pull(destination) {
     try {
      if(first.length){destination.enqueue(first.shift());return;}
      const part=await reader.read();
      if(part.done){destination.close();reader.releaseLock();}
      else destination.enqueue(part.value);
     }catch(error){destination.error(error);controller.abort();}
    },
    async cancel(reason){controller.abort();await reader.cancel(reason).catch(()=>{});}
   });
   // Workers ignores a manually assigned length on a generic stream. A fixed
   // stream keeps browser progress accurate and detects truncated transfers.
   if(length!==null&&typeof globalThis.FixedLengthStream==='function')body=body.pipeThrough(new globalThis.FixedLengthStream(length));
   return new Response(body,{status:response.status,headers:outgoing});
  }catch {
   clearTimeout(timer);controller.abort();
   if(reader)await reader.cancel().catch(()=>{});
   else await response?.body?.cancel().catch(()=>{});
   if(request.signal.aborted)break;
  }
 }
 return deliveryError(platform,new URL(github).pathname.slice('/LoveMaker-art/noras-tavern/releases/download/'.length),headers);
}
export async function download(request,env,ctx,options={}) {
 const u=new URL(request.url),platform=u.pathname.slice('/api/download/'.length);
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const origin=request.headers.get('Origin');
 if(['https://noratavern.com','https://lovemaker-art.github.io'].includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';}
 const json=(body,status)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
 if(!Object.hasOwn(patterns,platform))return json({error:'unknown_platform'},404);
 if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
 try {
  // A pinned filename supplied by the page cannot become a general proxy: the
  // only destinations are this repository and its identical SourceForge path.
  if(u.searchParams.has('asset')) {
   const asset={url:BASE+u.searchParams.get('asset'),published:'2000-01-01T00:00:00Z'};
   if(u.searchParams.has('format')||!valid(platform,asset))return json({error:'invalid_asset'},400);
   return await transferInstaller(request,platform,asset,headers,options);
  }
  const result=await resolveInstaller(env,platform,{...options,force:u.searchParams.get('retry')==='1'});
  if(u.searchParams.get('format')==='json')return json({...result,platform},200);
  return await transferInstaller(request,platform,result,headers,options);
 }catch(error){
  const retry=error.retryAfter||30;headers['Retry-After']=String(retry);
  if(u.searchParams.get('format')==='json')return json({error:error.message==='check_cooldown'?'check_cooldown':'download_unavailable',retryAfter:retry},error.retryAfter?429:503);
  return json({error:'download_unavailable',retryAfter:retry},503);
 }
}
