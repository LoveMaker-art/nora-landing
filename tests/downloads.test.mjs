import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {download,resolveInstaller,refreshInstallers,selectInstallers} from '../server/downloads.mjs';
import seed from '../server/installer-seed.json' with {type:'json'};
const NOW=1800000000000;
function database(){
 const sql=new DatabaseSync(':memory:');
 for(const file of ['0002_installer_links.sql','0003_download_health.sql'])sql.exec(readFileSync('migrations/'+file,'utf8'));
 const prepare=query=>({bind(...args){
  return {async run(){return sql.prepare(query).run(...args);},async all(){return {results:sql.prepare(query).all(...args)};}};
 }});
 return {sql,DB:{prepare}};
}
function put(env,platform='windows',age=1000){const a=seed[platform];env.sql.prepare('INSERT INTO installer_links VALUES(?,?,?,?)').run(platform,a.url,a.published,NOW-age);return a.url;}
function release(tag='v2.3.18',platform='windows') {const suffix={windows:'win-x64-setup.exe','mac-arm64':'mac-arm64.dmg','mac-x64':'mac-x64.dmg'}[platform];const name=`Nora-Tavern-Launcher-1.2.0-${suffix}`;return {tag_name:tag,published_at:'2026-10-01T00:00:00Z',assets:[{name,state:'uploaded',size:100,browser_download_url:`https://github.com/LoveMaker-art/noras-tavern/releases/download/${tag}/${name}`}]};}
const req=(q='')=>new Request('https://noratavern.com/api/download/windows'+q,{headers:{Origin:'https://lovemaker-art.github.io'}});
test('initial button targets remain usable without waiting for browser JS',()=>{
 const html=readFileSync('index.html','utf8');for(const p of Object.keys(seed))assert.ok(html.includes(`data-installer="${p}" href="https://noratavern.com/api/download/${p}"`));
 assert.ok(!html.includes('id="installer-retry"'));assert.ok(!html.includes('GitHub 备用下载入口'));
});
test('fresh cached address responds immediately without GitHub request',async()=>{
 const env=database(),url=put(env);let calls=0;
 const r=await download(req('?format=json'),env,null,{now:NOW,fetcher:async()=>{calls++;throw Error();}});
 assert.equal(r.status,200);assert.equal((await r.json()).url,url);assert.equal(calls,0);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://lovemaker-art.github.io');
});
test('cold start verifies seed even when release API fails; never redirects to tag',async()=>{
 const env=database();const r=await download(req(),env,null,{now:NOW,fetcher:async(u,o)=>new Response(null,{status:o.method==='HEAD'?200:403})});
 assert.equal(r.status,302);assert.equal(r.headers.get('Location'),seed.windows.url);
});
for (const failure of ['read','write','missing']) test(`verified installers remain downloadable when database ${failure} fails`,async()=>{
 const latest=release(),env=failure==='missing'?{}:{DB:{prepare(){return {bind(){return {
  async all(){if(failure==='read')throw Error('D1 daily read limit exceeded');return {results:[]};},
  async run(){throw Error('D1 unavailable');}
 }}};}}};
 const response=await download(req('?format=json'),env,null,{now:NOW,fetcher:async(url,options)=>
  options.method==='HEAD'?new Response(null,{headers:{'Content-Type':'application/octet-stream'}}):Response.json([latest])});
 assert.equal(response.status,200);
 assert.equal((await response.json()).url,latest.assets[0].browser_download_url);
});
test('database failure cannot turn an unverified or deleted installer into a download',async()=>{
 const env={DB:{prepare(){throw Error('D1 daily read limit exceeded');}}};
 const response=await download(req('?format=json'),env,null,{now:NOW,fetcher:async(url,options)=>
  options.method==='HEAD'?new Response(null,{status:404}):Response.json([])});
 assert.equal(response.status,503);
 assert.equal(response.headers.get('Location'),null);
});
test('database-independent cache and concurrent requests reuse only a verified address',async()=>{
 const entries=new Map(),cache={async match(key){return entries.get(key)?.clone();},async put(key,response){entries.set(key,response.clone());}};
 let reads=0,heads=0;
 const env={DB:{prepare(){reads++;throw Error('D1 daily read limit exceeded');}}},latest=release();
 const fetcher=async(url,options)=>{await new Promise(resolve=>setTimeout(resolve,2));if(options.method==='HEAD'){heads++;return new Response(null);}return Response.json([latest]);};
 const options={now:NOW,fetcher,cache};
 const results=await Promise.all(Array.from({length:10},()=>resolveInstaller(env,'windows',options)));
 assert.equal(reads,1);assert.ok(results.every(r=>r.url===latest.assets[0].browser_download_url));
 const previousHeads=heads;await resolveInstaller(env,'windows',{...options,now:NOW+1000});assert.equal(reads,1);assert.equal(heads,previousHeads);
 await resolveInstaller(env,'windows',{...options,now:NOW+901000});assert.equal(reads,2);assert.ok(heads>previousHeads);
});
test('confirmed 404 is persisted and replaced by a verified alternative',async()=>{
 const env=database(),old=put(env,'windows',3600000),latest=release();
 const fetcher=async(u,o)=>o.method==='HEAD'?new Response(null,{status:u===old?404:200}):Response.json([latest]);
 const result=await resolveInstaller(env,'windows',{now:NOW,fetcher});
 assert.equal(result.url,latest.assets[0].browser_download_url);
 assert.equal(env.sql.prepare('SELECT state FROM installer_health WHERE url=?').get(old).state,'missing');
});
test('dead cache and seed never reappear, including retries and cooldown',async()=>{
 const env=database();put(env,'windows',3600000);
 let heads=0;const fetcher=async(u,o)=>{if(o.method==='HEAD'){heads++;return new Response(null,{status:410});}return Response.json([]);};
 const r=await download(req('?format=json'),env,null,{now:NOW,fetcher});assert.equal(r.status,503);assert.equal(r.headers.get('Location'),null);
 const again=await download(req('?format=json&retry=1'),env,null,{now:NOW+1000,fetcher});assert.equal(again.status,429);assert.equal(heads,1);
 await assert.rejects(resolveInstaller(env,'windows',{force:true,now:NOW+31000,fetcher}),/download_unavailable/);assert.equal(heads,1);
});
test('search skips a broken newest binary and component-only release',async()=>{
 const env=database(),latest=release(),older=release('v2.3.16');older.published_at='2026-09-23T00:00:00Z';
 const fetcher=async(u,o)=>o.method==='HEAD'?new Response(null,{status:u===older.assets[0].browser_download_url?200:404}):Response.json([{tag_name:'v2.3.19',assets:[]},latest,older]);
 assert.equal((await resolveInstaller(env,'windows',{now:NOW,fetcher})).url,older.assets[0].browser_download_url);
});
test('transient upstream failure permits recent cache but not ancient unchecked fallback',async()=>{
 const env=database(),url=put(env,'windows',3600000);const fetcher=async()=>{throw Error('timeout');};
 assert.equal((await resolveInstaller(env,'windows',{now:NOW,fetcher})).url,url);
 const expired=database();put(expired,'windows',2*86400000);
 await assert.rejects(resolveInstaller(expired,'windows',{now:NOW,fetcher}),/download_unavailable/);
});
test('retry forces a check even for fresh cache and is throttled across instances by DB',async()=>{
 const env=database();put(env);let heads=0;const fetcher=async(u,o)=>{if(o.method==='HEAD'){heads++;return new Response(null,{status:200});}return Response.json([]);};
 await resolveInstaller(env,'windows',{force:true,now:NOW,fetcher});assert.equal(heads,1);
 await assert.rejects(resolveInstaller(env,'windows',{force:true,now:NOW+1000,fetcher}),/check_cooldown/);
 await resolveInstaller(env,'windows',{force:true,now:NOW+31000,fetcher});assert.equal(heads,2);
});
test('platforms are independent; no configuration fails closed',async()=>{
 const env=database();const fetcher=async(u,o)=>{if(o.method==='HEAD')return new Response(null,{status:u.endsWith('.exe')?404:200});return Response.json([]);};
 await refreshInstallers(env,fetcher);
 assert.equal(env.sql.prepare('SELECT count(*) n FROM installer_links').get().n,2);
 assert.equal((await download(req(),{},null,{fetcher:async()=>new Response(null,{status:503})})).status,503);
 assert.equal((await download(new Request('https://noratavern.com/api/download/invalid'),env)).status,404);
});
test('release selection rejects test packages and mismatched URLs',()=>{
 const r=release();assert.ok(selectInstallers([r]).windows);assert.deepEqual(selectInstallers([{...r,prerelease:true}]),{});
 r.assets[0].browser_download_url='https://evil.example/package.exe';assert.deepEqual(selectInstallers([r]),{});
});
test('HTTP 200 HTML error page is not accepted as an installer',async()=>{
 const env=database();
 const fetcher=async(u,o)=>o.method==='HEAD'?new Response(null,{status:200,headers:{'Content-Type':'text/html'}}):Response.json([]);
 await assert.rejects(resolveInstaller(env,'windows',{now:NOW,fetcher}),/download_unavailable/);
});
const SF='https://downloads.sourceforge.net/project/nora-tavern/';
test('healthy GitHub checks never contact SourceForge',async()=>{
 const env=database(),calls=[],latest=release();
 const result=await resolveInstaller(env,'windows',{now:NOW,fetcher:async(u,o)=>{calls.push(u);return o.method==='HEAD'?new Response(null):Response.json([latest]);}});
 assert.equal(result.url,latest.assets[0].browser_download_url);
 assert.ok(calls.every(u=>!u.includes('sourceforge.net')));
});
test('throttled GitHub discovers and verifies an installer through the SourceForge catalogue',async()=>{
 const env=database(),latest=release(),calls=[];
 latest.assets[0].digest='sha256:'+'a'.repeat(64);
 const result=await resolveInstaller(env,'windows',{now:NOW,fetcher:async(u,o)=>{
  calls.push(u);if(!u.includes('sourceforge.net'))return new Response(null,{status:403});
  assert.equal(o.redirect,'manual');
  if(u===SF+'channels/stable.json')return new Response(null,{status:302,headers:{Location:u.replace('downloads.sourceforge.net','zenlayer.dl.sourceforge.net')}});
  if(u.includes('channels/stable.json'))return Response.json(latest);
  return new Response(null,{headers:{'Content-Type':'application/octet-stream','Content-Length':'100'}});
 }});
 assert.equal(result.url,latest.assets[0].browser_download_url.replace('https://github.com/LoveMaker-art/noras-tavern/releases/download/',SF));
 assert.ok(calls.includes(SF+'channels/stable.json'));
 const cached=await resolveInstaller(env,'windows',{now:NOW+1000,fetcher:async()=>assert.fail('fresh verified backup should be cached')});
 assert.equal(cached.url,result.url);
});
test('a failed GitHub file uses the same version on SourceForge even when GitHub metadata works',async()=>{
 const env=database(),latest=release();
 const result=await resolveInstaller(env,'windows',{now:NOW,fetcher:async(u,o)=>o.method==='HEAD'
  ?new Response(null,{status:u.startsWith(SF)?200:503}):Response.json([latest])});
 assert.equal(result.url,latest.assets[0].browser_download_url.replace('https://github.com/LoveMaker-art/noras-tavern/releases/download/',SF));
});
test('a SourceForge redirect outside its trusted project never receives a request',async()=>{
 const env=database(),calls=[];
 await assert.rejects(resolveInstaller(env,'windows',{now:NOW,fetcher:async(u,o)=>{
  calls.push(u);if(!u.startsWith(SF))return new Response(null,{status:403});
  return new Response(null,{status:302,headers:{Location:'https://evil.example/channels/stable.json'}});
 }}),/download_unavailable/);
 assert.ok(calls.every(u=>!u.startsWith('https://evil.example/')));
});
