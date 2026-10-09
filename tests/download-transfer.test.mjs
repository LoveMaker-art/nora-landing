import test from 'node:test';
import assert from 'node:assert/strict';
import {download} from '../server/downloads.mjs';
const GH='https://github.com/LoveMaker-art/noras-tavern/releases/download/';
const SF='https://downloads.sourceforge.net/project/nora-tavern/';
const names={windows:'Nora-Tavern-Launcher-2.0.2-win-x64-setup.exe','mac-arm64':'Nora-Tavern-Launcher-2.0.2-mac-arm64.dmg','mac-x64':'Nora-Tavern-Launcher-2.0.2-mac-x64.dmg'};
function request(platform='windows',extra={},method='GET') {
 const u=new URL('https://noratavern.com/api/download/'+platform);u.searchParams.set('asset','v2.4.2/'+names[platform]);
 return new Request(u,{method,headers:extra});
}
const bytes=new Uint8Array([77,90,1,2,3,4]);
const file=()=>new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}});
for(const platform of Object.keys(names))test(`${platform}: SF 403 falls back to the exact GitHub file and returns its bytes`,async()=>{
 const calls=[];
 const r=await download(request(platform),{},null,{fetcher:async(u,o)=>{calls.push([u,o.method]);return u.startsWith(SF)?new Response('no',{status:403}):file();}});
 assert.equal(r.status,200);assert.deepEqual(calls,[[SF+'v2.4.2/'+names[platform],'GET'],[GH+'v2.4.2/'+names[platform],'GET']]);
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
 assert.equal(r.headers.get('Location'),null);assert.match(r.headers.get('Content-Disposition'),new RegExp(names[platform].replaceAll('.','\\.')));
 assert.equal(r.headers.get('X-Nora-Download-Source'),'github');
});
test('healthy SF is streamed without requesting GitHub; no body is buffered in full',async()=>{
 const calls=[];let pulled=0;
 const r=await download(request(),{},null,{fetcher:async u=>{calls.push(u);return new Response(new ReadableStream({pull(c){pulled++;if(pulled===1)c.enqueue(bytes);else if(pulled<100)c.enqueue(new Uint8Array(1024));else c.close();}}),{headers:{'Content-Type':'application/octet-stream'}});}});
 assert.equal(r.status,200);assert.equal(calls.length,1);assert.ok(calls[0].startsWith(SF));assert.ok(pulled<10);
 assert.equal(r.headers.get('X-Nora-Download-Source'),'sourceforge');await r.body.cancel();
});
for(const failure of ['html','plain','empty','body-error','wrong-exe'])test(`SF ${failure} cannot be saved as an installer; GitHub fallback works`,async()=>{
 const calls=[];
 const r=await download(request(),{},null,{fetcher:async u=>{calls.push(u);if(u.startsWith(GH))return file();
  if(failure==='html')return new Response('<html>error</html>',{headers:{'Content-Type':'application/octet-stream'}});
  if(failure==='plain')return new Response('quota',{headers:{'Content-Type':'text/plain'}});
  if(failure==='empty')return new Response(new Uint8Array(),{headers:{'Content-Type':'application/octet-stream'}});
  if(failure==='body-error')return new Response(new ReadableStream({start(c){c.error(Error('reset'));}}),{headers:{'Content-Type':'application/octet-stream'}});
  return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'application/octet-stream'}});
 }});
 assert.equal(r.status,200);assert.equal(calls.length,2);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
});
test('SF response timeout falls back before any file bytes reach the client',async()=>{
 const calls=[];
 const r=await download(request(),{},null,{transferTimeoutMs:20,fetcher:async(u,o)=>{calls.push(u);if(u.startsWith(GH))return file();return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));}});
 assert.equal(r.status,200);assert.equal(calls.length,2);await r.body.cancel();
});
test('both sources failing returns a visible error, never a release-page redirect',async()=>{
 const calls=[];const r=await download(request(),{},null,{fetcher:async u=>{calls.push(u);return new Response('no',{status:403});}});
 assert.equal(r.status,503);assert.equal(r.headers.get('Location'),null);assert.match(await r.text(),/"error":"download_unavailable"/);assert.equal(calls.length,2);
 assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors https:\/\/noratavern.com https:\/\/lovemaker-art.github.io/);
});
test('untrusted SF redirects are cancelled and the GitHub fallback is used',async()=>{
 const calls=[];const r=await download(request(),{},null,{fetcher:async u=>{calls.push(u);return u.startsWith(SF)?new Response(null,{status:302,headers:{Location:'https://evil.example/file.exe'}}):file();}});
 assert.equal(r.status,200);assert.equal(calls.length,2);assert.ok(calls.every(u=>!u.includes('evil.example')));await r.body.cancel();
});
test('range downloads preserve the exact range on fallback',async()=>{
 const r=await download(request('windows',{Range:'bytes=2-4'}),{},null,{fetcher:async(u,o)=>{
  assert.equal(o.headers.Range,'bytes=2-4');return u.startsWith(SF)?new Response('no',{status:403}):new Response(bytes.slice(2,5),{status:206,headers:{'Content-Type':'application/octet-stream','Content-Range':'bytes 2-4/6','Content-Length':'3'}});
 }});
 assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 2-4/6');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes.slice(2,5));
});
test('malformed or foreign pinned assets never initiate an upstream request',async()=>{
 for(const asset of ['https://evil.example/file.exe','v2.4.2/../foo.exe','v2.4.2/'+names['mac-arm64'],'v2.4.2/'+names.windows+'?token=x']) {
  const u=new URL(request().url);u.searchParams.set('asset',asset);
  const r=await download(new Request(u),{},null,{fetcher:async()=>assert.fail('invalid asset requested')});assert.equal(r.status,400);
 }
});
test('a stalled first body read falls back, while successful transfers are not subject to the preparation timeout',async()=>{
 let cancel;
 const r=await download(request(),{},null,{transferTimeoutMs:20,fetcher:async(u,o)=>{
  if(u.startsWith(SF))return new Response(new ReadableStream({start(c){o.signal.addEventListener('abort',()=>c.error(o.signal.reason),{once:true});}}),{headers:{'Content-Type':'application/octet-stream'}});
  return new Response(new ReadableStream({start(c){c.enqueue(bytes);cancel=()=>c.close();}}),{headers:{'Content-Type':'application/octet-stream'}});
 }});
 assert.equal(r.status,200);await new Promise(r=>setTimeout(r,40));cancel();assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
});

test('HEAD reads one byte, returns the full file length and never streams the entire installer',async()=>{
 const calls=[];const r=await download(request('windows',{},'HEAD'),{},null,{fetcher:async(u,o)=>{calls.push(u);assert.equal(o.headers.Range,'bytes=0-0');return new Response(bytes.slice(0,1),{status:206,headers:{'Content-Type':'application/octet-stream','Content-Range':'bytes 0-0/6','Content-Length':'1'}});}});
 assert.equal(r.status,200);assert.equal(r.headers.get('Content-Length'),'6');assert.equal(await r.text(),'');assert.equal(calls.length,1);
});
test('malformed ranges are rejected before contacting either source',async()=>{
 for(const Range of ['bytes=','bytes=8-2','bytes=0-1,3-4','bytes=-0','bytes=9007199254740992-']) {
  const r=await download(request('windows',{Range}),{},null,{fetcher:async()=>assert.fail('invalid range requested')});assert.equal(r.status,416);
 }
});
test('a transfer interrupted after delivery starts fails instead of appending a second file',async()=>{
 let fail;const calls=[];
 const r=await download(request(),{},null,{fetcher:async u=>{calls.push(u);return new Response(new ReadableStream({start(c){c.enqueue(bytes);fail=()=>c.error(Error('connection reset'));}}),{headers:{'Content-Type':'application/octet-stream'}});}});
 const reader=r.body.getReader();assert.deepEqual((await reader.read()).value,bytes);fail();await assert.rejects(reader.read(),/connection reset/);assert.equal(calls.length,1);
});
test('an HTML error split into tiny chunks is rejected on Mac before any bytes are sent',async()=>{
 const calls=[];const r=await download(request('mac-arm64'),{},null,{fetcher:async u=>{
  calls.push(u);if(u.startsWith(GH))return file();
  return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('<h'));c.enqueue(new TextEncoder().encode('tml>error</html>'));c.close();}}),{headers:{'Content-Type':'application/octet-stream'}});
 }});
 assert.equal(r.status,200);assert.equal(calls.length,2);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
});
