import seed from './installer-seed.json' with {type:'json'};
const base='https://github.com/LoveMaker-art/noras-tavern/releases/download/';
const patterns={windows:/^Nora-Tavern-Launcher-[\d.]+-win-x64-setup\.exe$/, 'mac-arm64':/^Nora-Tavern-Launcher-[\d.]+-mac-arm64\.dmg$/, 'mac-x64':/^Nora-Tavern-Launcher-[\d.]+-mac-x64\.dmg$/};
const TTL=15*60*1000;
export function selectInstallers(releases) {
 const result={};
 for(const r of releases.filter(r=>!r.draft&&!r.prerelease&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at))) {
  for(const [platform,pattern] of Object.entries(patterns)) {
   if(result[platform])continue;
   const a=(r.assets||[]).find(a=>pattern.test(a.name)&&a.state==='uploaded'&&a.size>0&&a.browser_download_url===`${base}${r.tag_name}/${a.name}`);
   if(a)result[platform]={url:a.browser_download_url,published:r.published_at};
  }
 }
 return result;
}
let pending;
export async function refreshInstallers(env,fetcher=fetch) {
 if(!env.DB)return;
 if(pending)return pending;
 pending=(async()=>{
  const found={};
  // Follow pagination: component releases must not hide older full installers.
  for(let page=1;page<=10;page++) {
   const r=await fetcher(`https://api.github.com/repos/LoveMaker-art/noras-tavern/releases?per_page=100&page=${page}`,{headers:{'User-Agent':'Nora-Landing-Downloads','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new Error(`GitHub ${r.status}`);
   const releases=await r.json();if(!Array.isArray(releases))throw new Error('Invalid releases');
   const selected=selectInstallers(releases);
   for(const [p,a] of Object.entries(selected))if(!found[p]||Date.parse(a.published)>Date.parse(found[p].published))found[p]=a;
   if(Object.keys(found).length===3||releases.length<100)break;
  }
  for(const [platform,asset] of Object.entries(found)) {
   // Never persist a missing binary or replace a good URL with a release page.
   const check=await fetcher(asset.url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(10000)});
   if(!check.ok)continue;
   await env.DB.prepare('INSERT INTO installer_links(platform,url,published,checked_at) VALUES(?,?,?,?) ON CONFLICT(platform) DO UPDATE SET url=excluded.url,published=excluded.published,checked_at=excluded.checked_at WHERE excluded.published >= installer_links.published').bind(platform,asset.url,asset.published,Date.now()).run();
  }
 })().finally(()=>{pending=undefined;});
 return pending;
}
export async function download(request,env,ctx) {
 const platform=new URL(request.url).pathname.slice('/api/download/'.length);
 if(!Object.hasOwn(patterns,platform))return new Response('Unknown platform',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 let saved;
 try {const rows=await env.DB.prepare('SELECT url,published,checked_at FROM installer_links WHERE platform=?').bind(platform).all();saved=rows.results[0];}catch{/* Verified bundled fallback also works before the migration. */}
 const valid=saved&&saved.url.startsWith(base)&&patterns[platform].test(saved.url.split('/').pop())&&Date.parse(saved.published)>=Date.parse(seed[platform].published);
 if(!valid||Date.now()-saved.checked_at>TTL)ctx?.waitUntil(refreshInstallers(env).catch(e=>console.error('Installer refresh failed:',e.message)));
 return new Response(null,{status:302,headers:{Location:valid?saved.url:seed[platform].url,'Cache-Control':'no-store'}});
}
