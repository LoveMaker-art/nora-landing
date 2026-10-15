import test from 'node:test';
import assert from 'node:assert/strict';
import {download,resolveInstaller} from '../server/downloads.mjs';

const GH='https://github.com/LoveMaker-art/noras-tavern/releases/download/';
const API='https://api.github.com/repos/LoveMaker-art/noras-tavern/releases';
const JIHU='https://jihulab.com/api/v4/projects/378185/packages/generic/nora-tavern/';
const STABLE='https://jihulab.com/LoveMaker-art/nora-tavern/-/raw/main/channels/stable.json';
const names={windows:'Nora-Tavern-Launcher-2.2.2-win-x64-setup.exe','mac-arm64':'Nora-Tavern-Launcher-2.2.2-mac-arm64.dmg','mac-x64':'Nora-Tavern-Launcher-2.2.2-mac-x64.dmg'};
const bytes=new Uint8Array([77,90,1,2,3,4]);
const release={tag_name:'v2.5.2',draft:false,prerelease:false,published_at:'2026-10-15T14:53:14Z',assets:Object.values(names).map(name=>({name,state:'uploaded',size:6,digest:'sha256:'+'a'.repeat(64),browser_download_url:GH+'v2.5.2/'+name}))};
for(const platform of Object.keys(names))test(`${platform}: domestic stable catalogue resolves the published installer without GitHub API`,async()=>{
 const calls=[];
 const result=await resolveInstaller({},platform,{fetcher:async(url,options)=>{
  calls.push(url);
  if(url===STABLE)return Response.json(release);
  assert.equal(url,JIHU+'v2.5.2/'+names[platform]);assert.equal(options.method,'HEAD');
  return new Response(null,{headers:{'Content-Type':'application/octet-stream','Content-Length':'6'}});
 }});
 assert.equal(result.url,GH+'v2.5.2/'+names[platform]);
 assert.deepEqual(calls,[STABLE,JIHU+'v2.5.2/'+names[platform]]);
});
test('GitHub fallback requests latest first; a large history page is unnecessary',async()=>{
 const calls=[];
 const result=await resolveInstaller({},'windows',{fetcher:async(url,options)=>{
  calls.push(url);
  if(url===STABLE)return new Response(null,{status:503});
  if(options.method==='HEAD')return new Response(null,{headers:{'Content-Type':'application/octet-stream'}});
  assert.equal(url,API+'/latest');return Response.json(release);
 }});
 assert.equal(result.url,GH+'v2.5.2/'+names.windows);
 assert.ok(calls.includes(API+'/latest'));assert.ok(!calls.some(url=>url.includes('?per_page=')));
});
for(const platform of Object.keys(names))test(`${platform}: actual delivery uses Jihu first and preserves the filename`,async()=>{
 const u=new URL('https://noratavern.com/api/download/'+platform);u.searchParams.set('asset','v2.5.2/'+names[platform]);
 const calls=[];const r=await download(new Request(u),{},null,{fetcher:async url=>{calls.push(url);return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':'6'}});}});
 assert.equal(r.status,200);assert.deepEqual(calls,[JIHU+'v2.5.2/'+names[platform]]);
 assert.equal(r.headers.get('X-Nora-Download-Source'),'jihulab');assert.ok(r.headers.get('Content-Disposition').includes(names[platform]));
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
});
test('failed domestic delivery preserves Range and the exact asset when switching source',async()=>{
 const u=new URL('https://noratavern.com/api/download/windows');u.searchParams.set('asset','v2.5.2/'+names.windows);
 const calls=[];const r=await download(new Request(u,{headers:{Range:'bytes=2-4'}}),{},null,{fetcher:async(url,options)=>{
  calls.push(url);assert.equal(options.headers.Range,'bytes=2-4');
  if(url.startsWith(JIHU))return new Response(null,{status:503});
  return new Response(bytes.slice(2,5),{status:206,headers:{'Content-Type':'application/octet-stream','Content-Length':'3','Content-Range':'bytes 2-4/6'}});
 }});
 assert.equal(r.status,206);assert.equal(calls.length,2);assert.ok(calls.every(url=>url.endsWith('v2.5.2/'+names.windows)));
 assert.equal(r.headers.get('Content-Range'),'bytes 2-4/6');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes.slice(2,5));
});
