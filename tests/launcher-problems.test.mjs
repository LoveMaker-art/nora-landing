import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {summarizeProblems} from '../server/launcher-problems.mjs';
import {monitorState} from '../server/launcher.mjs';
const now=Date.parse('2026-10-02T12:00:00Z');
function row(sequence,extra={}){return {event_id:crypto.randomUUID(),installation_id:'a'.repeat(64),operation_id:'task1',sequence,event:'operation_finished',occurred_at:now-10000+sequence,received_at:now,platform:'win32',arch:'x64',launcher_version:'2.0.1',product_version:'2.4.1',cohort:'new',action:'update',stage:'update_apply',status:'failed',error_code:'process_failed',error_source:'launcher_process',error_site:'process.run',system_code:'',http_status:null,exit_code:1,exit_signal:'',error_kind:'Error',attempt:1,elapsed_ms:1000,stage_elapsed_ms:1000,progress_age_ms:null,fault:null,...extra};}
const fault=fingerprint=>({fingerprint,errors:[],output:[]});
const summary=(errors,evidence)=>summarizeProblems(errors,evidence,{monitorState,now});
test('group retries by installation and task, not raw error count; same issue follows stages and versions',async()=>{
 const a=row(1,{event:'launcher_error',fault:fault('a'.repeat(64))}),b=row(2,{fault:a.fault}),c=row(3,{operation_id:'task2',stage:'stop',launcher_version:'2.0.2',fault:a.fault});
 const d=await summary([a,b,c],[b,c]);
 assert.deepEqual(d.summary,{error_events:3,attempts:2,failed_attempts:2,affected_installations:1,problems:1});
 const p=d.problems[0];assert.equal(p.attempts,2);assert.equal(p.affected_installations,1);assert.equal(p.installations[0].failed_attempts,2);
 assert.deepEqual(p.stages,['stop','update_apply']);assert.deepEqual(p.launcher_versions,['2.0.1','2.0.2']);
});
test('success after retry resolves an installation; later error resets it, without dropping raw failures',async()=>{
 const a=row(1),success=row(2,{operation_id:'retry',status:'succeeded'});
 let d=await summary([a],[a,success]);assert.equal(d.problems[0].recovered_installations,1);assert.equal(d.problems[0].failed_attempts,1);
 const b=row(3,{operation_id:'third'});d=await summary([a,b],[a,success,b]);
 assert.equal(d.problems[0].no_observed_recovery_installations,1);assert.equal(d.problems[0].recovered_installations,0);
});
test('successful start/readiness never resolves a failed update; successful same task retry does',async()=>{
 const a=row(1),start=row(2,{action:'start',status:'succeeded'}),ready=row(3,{event:'runtime_first_ready',action:'none',operation_id:'',status:'succeeded'});
 let d=await summary([a],[a,start,ready]);const installation=d.problems[0].installations[0];
 assert.equal(installation.recovery,'no_observed_recovery');assert.equal(installation.later_start_succeeded,true);assert.equal(installation.later_runtime_ready,true);
 const error=row(1,{event:'launcher_error'}),success=row(2,{status:'succeeded'});d=await summary([error],[success]);
 assert.equal(d.problems[0].recovered_attempts,1);assert.equal(d.summary.failed_attempts,0);assert.equal(d.problems[0].recovered_installations,1);
});
test('latest in-progress retry does not imply recovery; missing evidence stays unknown',async()=>{
 const a=row(1),start=row(2,{operation_id:'retry',event:'operation_started',status:'running'});
 const d=await summary([a],[a,start]);assert.equal(d.problems[0].installations[0].latest_action_outcome.status,'running');assert.equal(d.problems[0].recovered_installations,0);
 const orphan=row(1,{event:'launcher_error'});const missing=await summary([orphan],[]);assert.equal(missing.summary.failed_attempts,0);assert.equal(missing.problems[0].installations[0].current,null);
});
test('unknown fault details are grouped conservatively; no fingerprint is claimed',async()=>{
 const a=row(1),b=row(2,{installation_id:'b'.repeat(64),stage:'verify'});
 const d=await summary([a,b],[a,b]);assert.equal(d.summary.problems,2);assert.equal(d.summary.affected_installations,2);
 assert.equal(d.problems[0].grouping_basis,'technical_signature');assert.equal(d.problems[0].fingerprint,null);
});
test('same-task companions share a unique detailed fingerprint but unknown retries do not invent a cause',async()=>{
 const a=row(1,{event:'launcher_error',fault:fault('a'.repeat(64))}),b=row(2),c=row(3,{operation_id:'task2'});
 const d=await summary([a,b,c],[b,c]);assert.equal(d.summary.attempts,2);assert.equal(d.problems.length,2);
 const detailed=d.problems.find(p=>p.fingerprint);assert.equal(detailed.error_events,2);assert.equal(detailed.attempts,1);
});
function fixture(){
 const db=new DatabaseSync(':memory:');for(const f of ['0005_launcher_events.sql','0006_launcher_error_details.sql','0007_launcher_fault_packets.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...v){return statement(sql,v);},async all(){return {results:db.prepare(sql).all(...args)};}});
 const env={DB:{prepare:statement},STATS_READ_KEY:'test-key'};
 const insert=e=>{const keys=Object.keys(e);db.prepare(`INSERT INTO launcher_events(${keys}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>k==='fault'&&e[k]!==null?JSON.stringify(e[k]):e[k]));};
 const get=(suffix='',auth='Bearer test-key')=>worker.fetch(new Request('https://noratavern.com/api/launcher/stats?from=2026-10-02&to=2026-10-02&view=problems'+suffix,{headers:{Authorization:auth}}),env);
 return {db,insert,get};
}
test('actual authenticated query supports problem/installation drilldown; recovery crosses date/version filters',async()=>{
 const f=fixture(),a=row(1,{launcher_version:'2.0.0'}),b=row(2,{launcher_version:'2.0.1',operation_id:crypto.randomUUID(),status:'succeeded',occurred_at:now+86400000});f.insert(a);f.insert(b);
 assert.equal((await f.get('','')).status,401);
 const r=await f.get('&launcher_version=2.0.0');assert.equal(r.status,200);const d=await r.json();assert.equal(d.summary.error_events,1);assert.equal(d.problems[0].recovered_installations,1);assert.equal(d.problems[0].installations,undefined);
 const detail=await(await f.get('&problem_id='+d.problems[0].problem_id)).json();assert.equal(detail.installations[0].installation_id,a.installation_id);assert.equal(detail.installations[0].latest_action_outcome.status,'succeeded');assert.equal(detail.next_offset,null);
 assert.equal((await f.get('&problem_id='+'f'.repeat(64))).status,404);
 for(const q of ['&cursor=0','&operation_id=x','&installation_id=x','&window_days=7','&offset=-1','&offset=1.5','&problem_id=bad'])assert.equal((await f.get(q)).status,400);
 f.db.close();
});
test('installation drilldown paginates more than 100 affected environments',async()=>{
 const f=fixture();for(let i=0;i<105;i++)f.insert(row(1,{installation_id:i.toString(16).padStart(64,'0'),operation_id:crypto.randomUUID()}));
 const d=await(await f.get()).json();assert.equal(d.summary.affected_installations,105);assert.equal(d.problems.length,1);
 const p=await(await f.get('&problem_id='+d.problems[0].problem_id)).json();assert.equal(p.installations.length,100);assert.equal(p.next_offset,100);
 const next=await(await f.get('&problem_id='+d.problems[0].problem_id+'&offset=100')).json();assert.equal(next.installations.length,5);assert.equal(next.next_offset,null);assert.equal(new Set([...p.installations,...next.installations].map(e=>e.installation_id)).size,105);
 f.db.close();
});
test('problem pages retain detailed samples without loading every packet into aggregation',async()=>{
 const f=fixture();for(let i=0;i<101;i++)f.insert(row(1,{installation_id:i.toString(16).padStart(64,'0'),operation_id:crypto.randomUUID(),fault:fault(i.toString(16).padStart(64,'0'))}));
 const first=await(await f.get()).json();assert.equal(first.problems.length,100);assert.equal(first.next_offset,100);assert.equal(first.summary.problems,101);
 assert.equal(first.problems[0].sample.fault.fingerprint,first.problems[0].fingerprint);
 const second=await(await f.get('&offset=100')).json();assert.equal(second.problems.length,1);assert.equal(second.next_offset,null);
 assert.equal(new Set([...first.problems,...second.problems].map(p=>p.problem_id)).size,101);f.db.close();
});
