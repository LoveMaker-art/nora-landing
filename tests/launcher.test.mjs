import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {monitorState,validLauncherEvent} from '../server/launcher.mjs';

function setup() {
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0005_launcher_events.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0006_launcher_error_details.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0007_launcher_fault_packets.sql',import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values);},async run(){return db.prepare(sql).run(...args);},async all(){return {results:db.prepare(sql).all(...args)};}});
 const env={DB:{prepare:statement},VISITOR_HASH_SECRET:'test-only',STATS_READ_KEY:'read-only-test'};
 const date=new Date(Date.now()+28800000).toISOString().slice(0,10);
 return {db,env,post:(events,headers={})=>worker.fetch(new Request('https://noratavern.com/api/launcher/events',{method:'POST',headers,body:JSON.stringify({events})}),env),
 get:(query='',auth='Bearer read-only-test')=>worker.fetch(new Request(`https://noratavern.com/api/launcher/stats?from=${date}&to=${date}${query}`,{headers:{Authorization:auth}}),env)};
}
function event(overrides={}) {return {schema_version:1,event_id:crypto.randomUUID(),installation_id:crypto.randomUUID(),operation_id:crypto.randomUUID(),sequence:1,event:'operation_started',occurred_at:Date.now(),platform:'win32',arch:'x64',launcher_version:'1.1.2',product_version:'2.3.17',cohort:'new',action:'install',stage:'prepare',status:'running',error_code:'none',elapsed_ms:0,stage_elapsed_ms:0,progress_age_ms:null,...overrides};}
test('ingest without query key, deduplicate, hash identities; protect all queries',async()=>{
 const f=setup(),e=event();assert.equal((await f.post([e])).status,202);await f.post([e]);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM launcher_events').get().n,1);
 const row=f.db.prepare('SELECT * FROM launcher_events').get();assert.notEqual(row.installation_id,e.installation_id);assert.equal(row.installation_id.length,64);
 assert.equal((await f.get('','')).status,401);assert.equal((await f.get('','Bearer bad')).status,401);
 assert.equal((await f.get()).status,200);
 const timeline=await(await f.get(`&operation_id=${e.operation_id}&installation_id=${row.installation_id}`)).json();assert.equal(timeline.timeline.length,1);
 const conflict=await(await f.post([{...e,event_id:crypto.randomUUID()}])).json();assert.equal(conflict.rejected_event_ids[0].reason,'identity_conflict');
});
test('strict privacy and limits reject unknown fields, raw errors, URLs and old events',async()=>{
 const f=setup();for(const change of [{secret:'key'},{error_code:'raw stack trace'},{product_version:'https://private'},{occurred_at:Date.now()-8*86400000}]){
  const response=await(await f.post([event(change)])).json();assert.equal(response.rejected_event_ids.length,1);
 }
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM launcher_events').get().n,0);
 assert.equal((await f.post(Array.from({length:21},()=>event()))).status,400);
 assert.equal((await f.post([event({secret:'x'.repeat(70000)})])).status,413);
 f.env.LAUNCHER_RATE_LIMITER={limit:async()=>({success:false})};assert.equal((await f.post([event()],{'CF-Connecting-IP':'192.0.2.1'})).status,429);
 delete f.env.LAUNCHER_RATE_LIMITER;f.env.LAUNCHER_TELEMETRY_PAUSED='true';assert.equal((await(await f.post([event()])).json()).paused,true);
});
test('late packets cannot reopen completed operation; aggregate failure and stages accurately',async()=>{
 const f=setup(),e=event();
 await f.post([{...e,event_id:crypto.randomUUID(),sequence:4,event:'operation_finished',stage:'runtime_extract',status:'failed',error_code:'disk_full',elapsed_ms:12000,stage_elapsed_ms:10000}]);
 await f.post([e,{...e,event_id:crypto.randomUUID(),sequence:2,event:'stage_finished',status:'succeeded',elapsed_ms:2000,stage_elapsed_ms:2000}]);
 const data=await(await f.get()).json();assert.equal(data.current[0].monitor_state,'failed');assert.equal(data.summary.failed_operations,1);assert.equal(data.failures[0].stage,'runtime_extract');assert.equal(data.durations[0].mean_ms,2000);
});
test('monitor does not confuse slow, stalled, offline, waiting and failure',()=>{
 const base={event:'heartbeat',status:'running',occurred_at:Date.now(),progress_age_ms:null,stage_elapsed_ms:400000};
 assert.equal(monitorState(base),'slow');assert.equal(monitorState({...base,progress_age_ms:130000}),'possibly_stalled');
 assert.equal(monitorState({...base,occurred_at:Date.now()-130000}),'contact_lost');
 assert.equal(monitorState({...base,event:'setup_waiting',status:'waiting'}),'waiting_for_user');
 assert.equal(validLauncherEvent(event({action:'none'})),false);
});
test('v2 launcher failure details survive ingestion and query; v1 still works and private fields are rejected', async () => {
 const f=setup();
 const e=event({schema_version:2,event:'operation_finished',status:'failed',action:'check_update',stage:'release_check',error_code:'http_forbidden',
  error_source:'release_service',error_site:'release.request',system_code:'',http_status:403,exit_code:null,exit_signal:'',error_kind:'Error',attempt:1});
 assert.deepEqual((await(await f.post([e])).json()).accepted_event_ids,[e.event_id]);
 const result=await(await f.get(`&operation_id=${e.operation_id}`)).json();
 assert.equal(result.timeline[0].http_status,403);assert.equal(result.timeline[0].error_site,'release.request');
 assert.equal((await(await f.post([event()])).json()).accepted_event_ids.length,1);
 for(const extra of [{error_site:'/Users/private'},{system_code:'secret'},{message:'private chat'},{http_status:999},{action:'mvu'}]) {
  assert.equal((await(await f.post([{...e,event_id:crypto.randomUUID(),sequence:2,...extra}])).json()).rejected_event_ids.length,1);
 }
 const stats=await(await f.get()).json();
 assert.equal(stats.failures[0].http_status,403);
 f.db.close();
});
test('retry errors remain visible without marking a running or recovered operation failed', async () => {
 const f=setup(),start=event();
 const retry={...start,schema_version:2,event_id:crypto.randomUUID(),sequence:2,event:'launcher_error',status:'failed',error_code:'network',
  error_source:'release_service',error_site:'release.request',system_code:'ERR_NETWORK_CHANGED',http_status:null,exit_code:null,exit_signal:'',error_kind:'Error',attempt:1};
 await f.post([start,retry]);
 let data=await(await f.get()).json();
 assert.equal(data.current[0].monitor_state,'running');
 assert.equal(data.summary.failed_operations,0);
 assert.equal(data.errors[0].operation_outcome,null);
 await f.post([{...start,event_id:crypto.randomUUID(),sequence:3,event:'operation_finished',status:'succeeded'}]);
 data=await(await f.get()).json();
 assert.equal(data.current[0].monitor_state,'succeeded');
 assert.equal(data.summary.failed_operations,0);
 assert.equal(data.errors[0].operation_outcome,'succeeded');
 f.db.close();
});

test('v3 bounded fault details are protected, queried and grouped; forged packet fields are rejected',async()=>{
 const f=setup();
 const fault={schema:1,fingerprint:'a'.repeat(64),truncated:false,environment:{os_release:'10.0',node:'24.19.0',electron:'38.0.0',launcher_build:'b'.repeat(64)},
  errors:[{relation:'error',kind:'TypeError',message:'Cannot read property of undefined',frames:['at install (<source>/main.js:42:8)'],code:'',syscall:'',path:''}],
  output:['installer failed'],breadcrumbs:[{event:'stage_started',stage:'runtime_extract',status:'running',elapsed_ms:100}]};
 const e=event({schema_version:3,event:'operation_finished',status:'failed',stage:'runtime_extract',error_code:'unknown',
  error_source:'launcher',error_site:'launcher.operation',system_code:'',http_status:null,exit_code:null,exit_signal:'',error_kind:'TypeError',attempt:1,fault});
 assert.deepEqual((await(await f.post([e])).json()).accepted_event_ids,[e.event_id]);
 assert.equal((await f.get(`&operation_id=${e.operation_id}`,'')).status,401);
 const details=await(await f.get(`&operation_id=${e.operation_id}`)).json();assert.deepEqual(details.timeline[0].fault,fault);
 const stats=await(await f.get()).json();assert.equal(stats.issues[0].fingerprint,fault.fingerprint);assert.equal(stats.issues[0].operations,1);
 for(const packet of [{...fault,privateKey:'secret'}, {...fault,output:['https://private.example/api']},
  {...fault,errors:[{...fault.errors[0],message:'Bearer private-token'}]}, {...fault,output:['x'.repeat(600)]},
  {...fault,environment:{...fault.environment,path:'/Users/private'}}]) {
  assert.equal((await(await f.post([{...e,event_id:crypto.randomUUID(),sequence:2,fault:packet}])).json()).rejected_event_ids.length,1);
 }
 assert.equal(validLauncherEvent({...e,status:'succeeded',error_code:'none'}),false);f.db.close();
});
