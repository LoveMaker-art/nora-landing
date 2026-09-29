import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
test('download buttons work immediately without browser GitHub resolution',()=>{
 const html=readFileSync('index.html','utf8');
 for(const platform of ['windows','mac-arm64','mac-x64']) assert.ok(html.includes(`data-installer="${platform}" href="https://noratavern.com/api/download/${platform}"`));
});
test('GitHub unavailable still redirects Windows to an EXE, never a release page',async()=>{
 const response=await worker.fetch(new Request('https://noratavern.com/api/download/windows'),{}, {waitUntil(){}});
 assert.equal(response.status,302);
 assert.match(response.headers.get('Location'),/\/releases\/download\/.+\.exe$/);
});
import {DatabaseSync} from 'node:sqlite';
import {selectInstallers,refreshInstallers} from '../server/downloads.mjs';
function database() {
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('migrations/0002_installer_links.sql','utf8'));
 return {DB:{prepare(sql) {
  return {bind(...args) {
   return {async run(){return db.prepare(sql).run(...args);},async all(){return {results:db.prepare(sql).all(...args)};}};
  }};
 }}};
}

function release(tag,platform='windows') {const suffix={windows:'win-x64-setup.exe','mac-arm64':'mac-arm64.dmg','mac-x64':'mac-x64.dmg'}[platform];const name=`Nora-Tavern-Launcher-1.2.0-${suffix}`;return {tag_name:tag,published_at:'2026-09-30T00:00:00Z',assets:[{name,state:'uploaded',size:100,browser_download_url:`https://github.com/LoveMaker-art/noras-tavern/releases/download/${tag}/${name}`}]};}
test('component-only releases do not displace installer; Windows does not require Mac packages',()=>{const r=release('v2.3.18');const component={tag_name:'v2.3.19',published_at:'2026-10-01T00:00:00Z',assets:[]};assert.equal(selectInstallers([component,r]).windows.url,r.assets[0].browser_download_url);assert.deepEqual(selectInstallers([{...r,prerelease:true}]),{});});
test('automatic refresh persists new downloadable binary; failed refresh retains last good URL',async()=>{
 const env=database();const r=release('v2.3.18');
 await refreshInstallers(env,async(url,opts)=>opts.method==='HEAD'?new Response(null,{status:200}):Response.json([r]));
 const request=new Request('https://noratavern.com/api/download/windows');
 assert.equal((await worker.fetch(request,env)).headers.get('Location'),r.assets[0].browser_download_url);
 await assert.rejects(refreshInstallers(env,async()=>new Response(null,{status:403})));
 assert.equal((await worker.fetch(request,env)).headers.get('Location'),r.assets[0].browser_download_url);
 const missing=release('v2.3.20');missing.published_at='2026-10-01T00:00:00Z';
 await refreshInstallers(env,async(url,opts)=>opts.method==='HEAD'?new Response(null,{status:404}):Response.json([missing]));
 assert.equal((await worker.fetch(request,env)).headers.get('Location'),r.assets[0].browser_download_url);
 assert.equal((await worker.fetch(new Request('https://noratavern.com/api/download/invalid'),env)).status,404);
});
