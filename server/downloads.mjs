import seed from './installer-seed.json' with {type:'json'};
const BASE='https://github.com/LoveMaker-art/noras-tavern/releases/download/';
const API='https://api.github.com/repos/LoveMaker-art/noras-tavern/releases';
const patterns={windows:/^Nora-Tavern-Launcher-[\d.]+-win-x64-setup\.exe$/, 'mac-arm64':/^Nora-Tavern-Launcher-[\d.]+-mac-arm64\.dmg$/, 'mac-x64':/^Nora-Tavern-Launcher-[\d.]+-mac-x64\.dmg$/};
const FRESH=15*60*1000, GRACE=24*60*60*1000, COOLDOWN=30000;
function valid(platform,asset) {
 if(!asset||!Number.isFinite(Date.parse(asset.published)))return false;
 try {const url=new URL(asset.url);return !url.search&&!url.hash&&asset.url.startsWith(BASE)&&/^v\d+\.\d+\.\d+$/.test(url.pathname.split('/').at(-2))&&patterns[platform].test(url.pathname.split('/').pop());}catch{return false;}
}
export function installerCandidates(releases,platform) {
 return releases.filter(r=>!r.draft&&!r.prerelease&&/^v\d+\.\d+\.\d+$/.test(r.tag_name))
 .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).flatMap(r=>(r.assets||[])
 .filter(a=>patterns[platform].test(a.name)&&a.state==='uploaded'&&a.size>0&&a.browser_download_url===`${BASE}${r.tag_name}/${a.name}`)
 .map(a=>({url:a.browser_download_url,published:r.published_at}))).filter(a=>valid(platform,a));
}
export function selectInstallers(releases) {
 return Object.fromEntries(Object.keys(patterns).flatMap(p=>{const a=installerCandidates(releases,p)[0];return a?[[p,a]]:[];}));
}
async function row(db,sql,...args){return (await db.prepare(sql).bind(...args).all()).results[0];}
async function save(db,platform,asset,now) {
 await db.prepare('INSERT INTO installer_links(platform,url,published,checked_at) VALUES(?,?,?,?) ON CONFLICT(platform) DO UPDATE SET url=excluded.url,published=excluded.published,checked_at=excluded.checked_at').bind(platform,asset.url,asset.published,now).run();
}
// A shared D1 lease bounds retries across Worker instances, not only one process.
export async function resolveInstaller(env,platform,{force=false,fetcher=fetch,now=Date.now()}={}) {
 if(!env.DB)throw new Error('temporarily_unavailable');
 const saved=await row(env.DB,'SELECT * FROM installer_links WHERE platform=?',platform);
 const current=valid(platform,saved)?saved:{...seed[platform],checked_at:0};
 const health=await row(env.DB,'SELECT * FROM installer_health WHERE url=?',current.url);
 const recentlyGood=()=>health?.state!=='missing'&&current.checked_at>0&&now-current.checked_at<GRACE;
 if(!force&&recentlyGood()&&now-current.checked_at<FRESH)return {url:current.url,source:'cache'};
 const lease=await env.DB.prepare('INSERT INTO installer_checks(platform,attempted_at) VALUES(?,?) ON CONFLICT(platform) DO UPDATE SET attempted_at=excluded.attempted_at WHERE installer_checks.attempted_at <= ?').bind(platform,now,now-COOLDOWN).run();
 if(Number(lease.meta?.changes??lease.changes??0)===0) {
  // A retry cannot silently reuse an unchecked address while another check runs.
  if(!force&&recentlyGood())return {url:current.url,source:'recent_cache'};
  const e=new Error('check_cooldown');e.retryAfter=30;throw e;
 }
 const deadline=AbortSignal.timeout(18000);
 const seen=new Map();
 let currentMissing=health?.state==='missing';
 const probe=async asset=>{
  if(seen.has(asset.url))return seen.get(asset.url);
  const known=await row(env.DB,'SELECT * FROM installer_health WHERE url=?',asset.url);
  // Do not resurrect a known deleted file through a seed or another release scan.
  if(known?.state==='missing'&&now-known.checked_at<FRESH){seen.set(asset.url,false);return false;}
  let state='unknown';
  try {
   const r=await fetcher(asset.url,{method:'HEAD',redirect:'follow',signal:AbortSignal.any([deadline,AbortSignal.timeout(5000)])});
   const type=r.headers.get('Content-Type')||'';
   const fileResponse=r.ok&&!/text\/html|application\/json/i.test(type)&&r.headers.get('Content-Length')!=='0';
   state=fileResponse?'healthy':[404,410].includes(r.status)?'missing':'unknown';
  }catch{}
  if(state!=='unknown')await env.DB.prepare('INSERT INTO installer_health(url,state,checked_at) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET state=excluded.state,checked_at=excluded.checked_at').bind(asset.url,state,now).run();
  if(asset.url===current.url&&state==='missing')currentMissing=true;
  seen.set(asset.url,state==='healthy');return state==='healthy';
 };
 let verified;
 if(await probe(current))verified=current;
 // Search alternatives too: the first matching release can itself contain a dead asset.
 try {
  for(let page=1;page<=3&&!deadline.aborted;page++) {
   const r=await fetcher(`${API}?per_page=100&page=${page}`,{headers:{'User-Agent':'Nora-Landing-Downloads','Accept':'application/vnd.github+json'},signal:AbortSignal.any([deadline,AbortSignal.timeout(5000)])});
   if(!r.ok)throw new Error('release_query_failed');
   const releases=await r.json();if(!Array.isArray(releases))throw new Error('invalid_releases');
   for(const asset of installerCandidates(releases,platform).slice(0,6)) {
    if(verified&&Date.parse(asset.published)<=Date.parse(verified.published))continue;
    if(await probe(asset)){verified=asset;break;}
   }
   if(verified||releases.length<100)break;
  }
 }catch{/* Only a verified file or a bounded, not-known-missing cache can be used. */}
 if(verified){await save(env.DB,platform,verified,now);return {url:verified.url,source:'verified'};}
 if(!currentMissing&&recentlyGood())return {url:current.url,source:'recent_cache'};
 throw new Error('download_unavailable');
}
export async function refreshInstallers(env,fetcher=fetch) {
 // One platform failure must not prevent other platforms from being checked.
 const results=await Promise.allSettled(Object.keys(patterns).map(p=>resolveInstaller(env,p,{force:true,fetcher})));
 results.forEach((r,i)=>{if(r.status==='rejected')console.error('Installer check:',Object.keys(patterns)[i],r.reason.message);});
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
  const result=await resolveInstaller(env,platform,{...options,force:u.searchParams.get('retry')==='1'});
  if(u.searchParams.get('format')==='json')return json({...result,platform},200);
  return new Response(null,{status:302,headers:{...headers,Location:result.url}});
 }catch(error){
  const retry=error.retryAfter||30;headers['Retry-After']=String(retry);
  if(u.searchParams.get('format')==='json')return json({error:error.message==='check_cooldown'?'check_cooldown':'download_unavailable',retryAfter:retry},error.retryAfter?429:503);
  return new Response(request.method==='HEAD'?null:'暂时无法获取安装包，请返回下载页面，稍后点击“重新检查下载”。',{status:503,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 }
}
