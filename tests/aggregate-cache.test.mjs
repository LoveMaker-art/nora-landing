import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateRead} from '../server/aggregate-cache.mjs';
import worker from '../server/worker.mjs';
function cache(){const data=new Map();return {
 async match(key){const row=data.get(String(key));return row&&row.until>Date.now()?row.response.clone():undefined;},
 async put(key,response){const seconds=Number(response.headers.get('Cache-Control').match(/max-age=(\d+)/)[1]);data.set(String(key),{response:response.clone(),until:Date.now()+seconds*1000});}
};}
const request=(query='from=2026-10-02&to=2026-10-08')=>new Request('https://noratavern.com/api/stats?'+query);
test('identical and concurrent queries share one computation; filters remain separate',async()=>{
 const store=cache();let calls=0;
 const load=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({generated_at:'original',value:calls});};
 const results=await Promise.all(Array.from({length:20},()=>aggregateRead(request(),load,{cache:store})));
 assert.equal(calls,1);for(const r of results){assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).value,1);}
 assert.equal((await aggregateRead(request('to=2026-10-08&from=2026-10-02'),load,{cache:store})).headers.get('X-Nora-Cache'),'hit');
 await aggregateRead(request('from=2026-10-02&to=2026-10-08&platform=win32'),load,{cache:store});assert.equal(calls,2);
});
test('expired aggregates refresh; ordinary errors are not cached',async t=>{
 let now=Date.parse('2026-10-09T06:00:00Z');t.mock.method(Date,'now',()=>now);
 const store=cache();let calls=0;const load=async()=>Response.json({value:++calls});
 await aggregateRead(request(),load,{cache:store});
 now+=1799000;const cached=await aggregateRead(request(),load,{cache:store});assert.equal(cached.headers.get('X-Nora-Cache'),'hit');assert.equal(calls,1);
 now+=1000;await aggregateRead(request(),load,{cache:store});assert.equal(calls,2);
 const failed=async()=>{calls++;return Response.json({error:'temporary'},{status:503});};
 for(let i=0;i<2;i++)await aggregateRead(request('from=2026-10-09&to=2026-10-09'),failed,{cache:store});assert.equal(calls,4);
});
test('quota exhaustion stops uncached reads across filters until UTC reset, never invents zero',async t=>{
 let now=Date.parse('2026-10-09T06:00:00Z');t.mock.method(Date,'now',()=>now);
 const store=cache();let calls=0;const load=async()=>{calls++;throw Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");};
 const first=await aggregateRead(request(),load,{cache:store});assert.equal(first.status,503);
 const body=await first.json();assert.equal(body.error,'daily_read_limit');assert.equal(body.retry_at,'2026-10-10T00:00:00.000Z');assert.equal(body.summary,undefined);
 await aggregateRead(request('from=2026-10-09&to=2026-10-09'),load,{cache:store});assert.equal(calls,1);
 now=Date.parse('2026-10-10T00:00:01Z');await aggregateRead(request(),load,{cache:store});assert.equal(calls,2);
});
test('cache failure does not prevent a successful live query',async()=>{
 const broken={async match(){throw Error('cache unavailable');},async put(){throw Error('cache unavailable');}};
 const result=await aggregateRead(request(),()=>Response.json({value:1}),{cache:broken});assert.equal(result.status,200);
});
test('cached aggregate access still requires valid authentication',async()=>{
 const original=globalThis.caches,store=cache();globalThis.caches={default:store};
 try{
  await aggregateRead(request(),()=>Response.json({private_aggregate:true}),{cache:store});
  const response=await worker.fetch(request(),{STATS_READ_KEY:'test-key'});assert.equal(response.status,401);
  const launcher=await worker.fetch(new Request('https://noratavern.com/api/launcher/stats?from=2026-10-02&to=2026-10-08&view=funnel'),{STATS_READ_KEY:'test-key'});assert.equal(launcher.status,401);
 }finally{if(original===undefined)delete globalThis.caches;else globalThis.caches=original;}
});
