import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {monitorState,validLauncherEvent} from '../server/launcher.mjs';

function setup() {
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0005_launcher_events.sql',import.meta.url),'utf8'));
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
