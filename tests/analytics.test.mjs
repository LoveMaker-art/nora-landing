import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync('analytics.js','utf8');
const settle=()=>new Promise(r=>setImmediate(r));
function harness(store=new Map(),fetcher=async()=>({status:202})){
 const handlers={},timers=[],sent=[];
 const root={dataset:{},addEventListener(){},querySelectorAll:()=>[]};
 const localStorage={get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const window={addEventListener:(k,f)=>(handlers[k]??=[]).push(f)};
 const context={document:{getElementById:()=>root,referrer:''},window,location:{hostname:'noratavern.com',href:'https://noratavern.com/'},navigator:{userAgent:'desktop'},crypto,URL,AbortSignal,localStorage,setTimeout:f=>{timers.push(f);return timers.length;},fetch:async(u,o)=>{const b=JSON.parse(o.body);sent.push(b);return fetcher(b);}};
 vm.runInNewContext(code,context);
 return {sent,timers,emit:(k,detail)=>handlers[k]?.forEach(f=>f({detail})),store};
}
test('offline queue survives reload with same event IDs and occurrence timestamps',async()=>{
 const store=new Map();const a=harness(store,async()=>{throw Error('offline');});await settle();
 const first=a.sent[0];assert.ok(store.has('nora_event_v2_'+first.event_id));
 const b=harness(store);await settle();assert.ok(b.sent.some(e=>e.event_id===first.event_id&&e.occurred_at===first.occurred_at));assert.equal([...store.keys()].filter(k=>k.startsWith('nora_event_v2_')).length,0);
});
test('rate limiting retains event and retries same ID; outcome uses platform',async()=>{
 let limited=true;const h=harness(new Map(),async()=>({status:limited?429:202}));await settle();const id=h.sent[0].event_id;
 limited=false;h.timers.shift()();await settle();assert.equal(h.sent[1].event_id,id);
 h.emit('nora:download-outcome',{event:'download_ready',platform:'windows',result:'ready'});await settle();assert.equal(h.sent.at(-1).event,'download_ready');assert.equal(h.sent.at(-1).action,'windows');
});
test('permanent rejection removed and unavailable storage does not prevent reporting',async()=>{
 const h=harness(new Map(),async()=>({status:400}));await settle();assert.equal([...h.store.keys()].filter(k=>k.startsWith('nora_event_v2_')).length,0);
 const store=new Map();store.set=()=>{throw Error('storage denied');};const x=harness(store);await settle();assert.equal(x.sent[0].event,'pageview');
});

test('obsolete resolver events no longer create telemetry',async()=>{
 const h=harness();await settle();const before=h.sent.length;
 h.emit('nora:installer-result',{result:'previous_complete'});await settle();assert.equal(h.sent.length,before);
});
