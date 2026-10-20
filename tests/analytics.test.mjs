import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync('analytics.js','utf8');
const settle=()=>new Promise(r=>setImmediate(r));
function harness(store=new Map(),fetcher=async()=>({status:202})){
 const handlers={},timers=[],sent=[],clicks=[];
 const root={dataset:{},addEventListener:(k,f)=>{if(k==='click')clicks.push(f);},querySelectorAll:()=>[]};
 class Element{constructor(action,disabled){this.dataset={entryAction:action};this.disabled=disabled;}closest(selector){return selector==='[data-entry-action]'?this:null;}}
 const localStorage={get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const window={addEventListener:(k,f)=>(handlers[k]??=[]).push(f)};
 const context={document:{getElementById:()=>root,referrer:''},window,Element,location:{hostname:'noratavern.com',href:'https://noratavern.com/'},navigator:{userAgent:'desktop'},crypto,URL,AbortSignal,localStorage,setTimeout:f=>{timers.push(f);return timers.length;},fetch:async(u,o)=>{const b=JSON.parse(o.body);sent.push(b);return fetcher(b);}};
 vm.runInNewContext(code,context);
 return {sent,timers,emit:(k,detail)=>handlers[k]?.forEach(f=>f({detail})),click:(action,disabled=false)=>clicks.forEach(f=>f({target:new Element(action,disabled),preventDefault:()=>{throw Error('navigation blocked');}})),store};
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

test('one tagged click emits one correctly scoped event and disabled entries emit none',async()=>{
 const h=harness();await settle();
 for(const action of ['clawchat-local','clawchat-cloud','cloud-add','netdisk-quark']){const n=h.sent.length;h.click(action);await settle();assert.equal(h.sent.length,n+1);assert.equal(h.sent.at(-1).action,action);assert.equal(h.sent.at(-1).event,'link_click');}
 const n=h.sent.length;h.click('cloud-add',true);h.click('unknown');await settle();assert.equal(h.sent.length,n);
});
test('all static download and adding routes carry an explicit scope',()=>{
 const html=readFileSync('index.html','utf8');
 assert.equal((html.match(/data-entry-action="clawchat-cloud"/g)||[]).length,7);
 assert.equal((html.match(/data-entry-action="clawchat-local"/g)||[]).length,1);
 assert.equal((html.match(/data-entry-action="cloud-add"/g)||[]).length,2);
});
test('offline deployment clicks queue and resume with the same IDs, without blocking navigation',async()=>{
 const store=new Map(),h=harness(store,async()=>{throw Error('offline');});await settle();h.click('cloud-add');await settle();
 const queued=[...store.entries()].filter(([k])=>k.startsWith('nora_event_v2_')).map(([,v])=>JSON.parse(v)).find(e=>e.action==='cloud-add');assert.ok(queued);
 const next=harness(store);await settle();assert.ok(next.sent.some(e=>e.event_id===queued.event_id&&e.action==='cloud-add'));
});

test('only the Quark entry is tagged; copying the code is not a download click',()=>{
 const html=readFileSync('index.html','utf8');
 assert.equal((html.match(/data-entry-action="netdisk-quark"/g)||[]).length,1);
 assert.match(html,/<a class="backup-download-link" data-entry-action="netdisk-quark" href="https:\/\/pan.quark.cn\/s\/537af45f3786"/);
 assert.ok(!html.match(/<button[^>]*id="backup-copy"[^>]*data-entry-action/));
});
