import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import skills from '../skills/catalogue.js';
import {sources,packageUrls} from '../skills/sources.js';
import {downloadCandidates,fetchSkillPackage} from '../skills/downloads.js';
const item=skills.find(s=>s.id==='nora-persona-designer');
const good=await readFile('skills/'+item.package);

test('public candidates use Jihu first and the exact same version/file at the website',()=>{
 const urls=downloadCandidates(item);assert.deepEqual(urls,packageUrls(item));
 assert.ok(urls[0].startsWith(sources.packageBases[0]));assert.ok(urls.every(u=>u.endsWith(`${item.id}-${item.version}.zip`)));
});
test('local preview only accesses the explicit local package',async()=>{
 const calls=[];const result=await fetchSkillPackage(item,{localPreview:true,baseUrl:'http://127.0.0.1:8776/skills/',fetcher:async u=>{calls.push(u);return new Response(good);}});
 assert.deepEqual(calls,['http://127.0.0.1:8776/skills/'+item.package]);assert.deepEqual(Buffer.from(result.bytes),good);
});
test('unavailable, corrupt, truncated or oversized primary never yields an unverified download',async()=>{
 for(const primary of [()=>new Response('',{status:503}),()=>new Response(Buffer.alloc(good.length)),()=>new Response(good.subarray(0,20)),()=>new Response(Buffer.alloc(good.length+1))]){
  const calls=[];const result=await fetchSkillPackage(item,{fetcher:async u=>{calls.push(u);return calls.length===1?primary():new Response(good);}});
  assert.deepEqual(calls,packageUrls(item));assert.equal(result.attempts.length,1);assert.deepEqual(Buffer.from(result.bytes),good);
 }
});
test('all sources failing rejects rather than redirecting to a release page',async()=>{
 let count=0;await assert.rejects(fetchSkillPackage(item,{fetcher:async()=>{count++;return new Response('bad');}}),/暂时无法获取/);assert.equal(count,2);
});
test('a healthy primary completes without contacting the fallback',async()=>{
 const calls=[];const result=await fetchSkillPackage(item,{fetcher:async u=>{calls.push(u);return new Response(good);}});
 assert.deepEqual(calls,[packageUrls(item)[0]]);assert.equal(result.attempts.length,0);
});
