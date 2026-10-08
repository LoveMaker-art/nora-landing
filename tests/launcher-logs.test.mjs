import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';

function setup() {
 const db=new DatabaseSync(':memory:');
 for(const name of ['0005_launcher_events.sql','0006_launcher_error_details.sql','0007_launcher_fault_packets.sql','0008_launcher_operation_logs.sql'])
  db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values);},async run(){return db.prepare(sql).run(...args);},async all(){return {results:db.prepare(sql).all(...args)};}});
 const env={DB:{prepare:statement},VISITOR_HASH_SECRET:'test-only',STATS_READ_KEY:'read-only-test'};
 const identity={installation_id:crypto.randomUUID(),operation_id:crypto.randomUUID(),log_id:crypto.randomUUID()};
 return {db,env,identity,
  post:value=>worker.fetch(new Request('https://noratavern.com/api/launcher/logs',{method:'POST',body:JSON.stringify(value)}),env),
  get:(query='',auth='Bearer read-only-test')=>worker.fetch(new Request(`https://noratavern.com/api/launcher/logs?operation_id=${identity.operation_id}${query}`,{headers:{Authorization:auth}}),env)};
}
async function packet(identity,overrides={}) {
 const value={schema:1,...identity,index:0,text:'stage started\nError: failed\n    at install (<source>/main.js:12:3)\n',final:true,missing:[],...overrides};
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([value.operation_id,value.log_id,value.index,value.text,value.final,value.missing])));
 return {...value,chunk_id:[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')};
}
test('log identity matches actual launcher event identity, and both queries require authorization',async()=>{
 const f=setup(),e={schema_version:1,event_id:crypto.randomUUID(),installation_id:f.identity.installation_id,operation_id:f.identity.operation_id,sequence:1,
  event:'operation_started',occurred_at:Date.now(),platform:'win32',arch:'x64',launcher_version:'2.0.2',product_version:'2.4.2',cohort:'new',action:'install',stage:'prepare',status:'running',error_code:'none',elapsed_ms:0,stage_elapsed_ms:0,progress_age_ms:null};
 const received=await worker.fetch(new Request('https://noratavern.com/api/launcher/events',{method:'POST',body:JSON.stringify({events:[e]})}),f.env);
 assert.deepEqual((await received.json()).accepted_event_ids,[e.event_id]);
 const value=await packet(f.identity);assert.equal((await f.post(value)).status,202);
 const stored=f.db.prepare('SELECT installation_id FROM launcher_events').get().installation_id;
 const data=await(await f.get(`&installation_id=${stored}`)).json();assert.equal(data.complete,true);assert.equal(data.chunks[0].text,value.text);
 assert.equal(data.installation_id,stored);assert.notEqual(stored,e.installation_id);
 assert.equal((await f.get('','')).status,401);assert.equal((await f.get('','Bearer bad')).status,401);
 assert.equal(f.db.prepare('SELECT count(*) n FROM launcher_events').get().n,1);f.db.close();
});
test('lost ACK retries are immutable; final may arrive before gaps but cannot hide higher chunks',async()=>{
 const f=setup(),last=await packet(f.identity,{index:2});assert.equal((await f.post(last)).status,202);
 assert.deepEqual(await(await f.post(last)).json(),{accepted:true,index:2,chunk_id:last.chunk_id});
 assert.equal((await f.post(await packet(f.identity,{index:2,text:'changed'}))).status,409);
 assert.equal((await f.post(await packet(f.identity,{index:3}))).status,409);
 let data=await(await f.get()).json();assert.equal(data.sequence_complete,false);
 for(const index of [1,0])assert.equal((await f.post(await packet(f.identity,{index,final:false}))).status,202);
 data=await(await f.get()).json();assert.equal(data.complete,true);assert.deepEqual(data.chunks.map(e=>e.chunk_index),[0,1,2]);
 const other=crypto.randomUUID();assert.equal((await f.post(await packet({...f.identity,log_id:other},{index:2,final:false}))).status,202);
 assert.equal((await f.post(await packet({...f.identity,log_id:other},{index:1,final:true}))).status,409);f.db.close();
});
test('pagination fixes snapshot identity and preserves all omission reasons, including beyond twelve chunks',async()=>{
 const f=setup();
 for(let index=0;index<18;index++)assert.equal((await f.post(await packet(f.identity,{index,text:`record ${index}\n`,final:index===17,missing:index===17?['chunk_limit']:['service_output_omitted']}))).status,202);
 const first=await(await f.get(`&log_id=${f.identity.log_id}`)).json();assert.equal(first.has_more,true);assert.equal(first.next_offset,16);assert.equal(first.chunks.length,16);
 assert.equal(first.sequence_complete,true);assert.equal(first.complete,false);assert.deepEqual(new Set(first.missing),new Set(['chunk_limit','service_output_omitted']));
 const next=await(await f.get(`&log_id=${first.log_id}&offset=${first.next_offset}`)).json();assert.equal(next.has_more,false);assert.deepEqual(next.chunks.map(e=>e.chunk_index),[16,17]);
 assert.equal(f.db.prepare('SELECT count(*) n FROM launcher_events').get().n,0);f.db.close();
});
test('nonexistent snapshot or installation is explicitly not received; terminal cursor remains valid',async()=>{
 const f=setup();assert.deepEqual((await(await f.get()).json()).missing,['not_received']);
 await f.post(await packet(f.identity));
 for(const query of [`&log_id=${crypto.randomUUID()}`,`&installation_id=${'a'.repeat(64)}`]){
  const data=await(await f.get(query)).json();assert.equal(data.complete,false);assert.deepEqual(data.missing,['not_received']);assert.deepEqual(data.chunks,[]);
 }
 assert.equal((await f.get('&offset=4096')).status,200);
 for(const offset of ['1e2','-1','4097',''])assert.equal((await f.get('&offset='+offset)).status,400);f.db.close();
});
test('same operation across installations needs disambiguation and snapshots stay separate',async()=>{
 const f=setup();await f.post(await packet(f.identity));
 const second={...f.identity,installation_id:crypto.randomUUID(),log_id:crypto.randomUUID()};await f.post(await packet(second));
 assert.equal((await f.get()).status,409);
 const id=f.db.prepare('SELECT installation_id FROM launcher_operation_logs WHERE log_id=?').get(f.identity.log_id).installation_id;
 const data=await(await f.get(`&installation_id=${id}&log_id=${f.identity.log_id}`)).json();assert.equal(data.complete,true);assert.equal(data.log_id,f.identity.log_id);f.db.close();
});
test('privacy, chunk digest, size, pause and rate limit reject packets without storing them',async()=>{
 const f=setup();
 for(const change of [{text:'https://private.example'}, {text:'/Users/private/key'}, {text:'Bearer secret'}, {text:'x'.repeat(16385)}, {missing:['invented']}, {index:4096}])
  assert.equal((await f.post(await packet(f.identity,change))).status,400);
 const value=await packet(f.identity);assert.equal((await f.post({...value,chunk_id:'a'.repeat(64)})).status,400);
 f.env.LAUNCHER_TELEMETRY_PAUSED='true';assert.equal((await f.post(value)).status,503);delete f.env.LAUNCHER_TELEMETRY_PAUSED;
 f.env.EVENT_RATE_LIMITER={limit:async()=>({success:false})};
 const response=await worker.fetch(new Request('https://noratavern.com/api/launcher/logs',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(value)}),f.env);
 assert.equal(response.status,429);assert.equal(f.db.prepare('SELECT count(*) n FROM launcher_operation_logs').get().n,0);f.db.close();
});
