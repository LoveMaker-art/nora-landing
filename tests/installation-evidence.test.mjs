import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import worker from '../server/worker.mjs';
import {summarizeFunnel} from '../server/launcher-funnel.mjs';

const now=Date.parse('2026-10-16T06:00:00Z'),day=86400000;
const row=(id,sequence,event,extra={})=>({event_id:crypto.randomUUID(),installation_id:id,operation_id:'task-'+id,sequence,event,occurred_at:now-10000+sequence,received_at:now,platform:'win32',arch:'x64',launcher_version:'2.1.2',product_version:'unknown',cohort:'new',action:'install',stage:'prepare',status:'running',error_code:'none',elapsed_ms:0,stage_elapsed_ms:0,progress_age_ms:null,...extra});
const seen=id=>row(id,1,'launcher_first_seen',{operation_id:'',action:'none'});
test('waiting steps remain distinct, reconcile to waiting total and exclude ready installations',()=>{
 const rows=[];
 for(const [id,stage] of [['a','wait_model'],['b','wait_pair'],['c','wait_start'],['d','legacy'],['e','wait_model']])rows.push(seen(id),row(id,2,'operation_started'),row(id,3,'operation_finished',{status:'succeeded'}),row(id,4,'setup_waiting',{stage,status:'waiting',action:'none',operation_id:''}));
 rows.push(row('e',5,'runtime_first_ready',{action:'none',status:'succeeded'}));
 const d=summarizeFunnel(rows,{from:'2026-10-16',to:'2026-10-16',windowDays:7,now});
 assert.equal(d.states.waiting_for_user,4);
 assert.deepEqual(d.waiting_steps.map(x=>[x.step,x.installations]).sort(),[['unknown',1],['wait_model',1],['wait_pair',1],['wait_start',1]]);
 assert.equal(d.waiting_steps.reduce((n,x)=>n+x.installations,0),d.states.waiting_for_user);
 assert.ok(d.waiting_steps.every(x=>x.stage==='install_completed'));
});

test('the actual receiver and dashboard adapters agree on waiting, cause, recovery and privacy',{skip:!process.env.NORA_DASHBOARD_SOURCE},async t=>{
 t.mock.method(Date,'now',()=>now);
 const {launcherStats}=await import(pathToFileURL(process.env.NORA_DASHBOARD_SOURCE+'/launcher-stats.mjs'));
 const {installationProblems}=await import(pathToFileURL(process.env.NORA_DASHBOARD_SOURCE+'/installation-problems.mjs'));
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const name of ['0005_launcher_events.sql','0006_launcher_error_details.sql','0007_launcher_fault_packets.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const prepare=(sql,args=[])=>({bind(...v){return prepare(sql,v)},async all(){return {results:db.prepare(sql).all(...args)}}});
 const env={DB:{prepare},STATS_READ_KEY:'fixture-key'};
 const insert=e=>{const keys=Object.keys(e);db.prepare(`INSERT INTO launcher_events(${keys}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>k==='fault'?JSON.stringify(e[k]):e[k]))};
 for(const [id,step] of [['model-private','wait_model'],['pair-private','wait_pair']]){
  insert(seen(id));insert(row(id,2,'operation_started'));insert(row(id,3,'operation_finished',{status:'succeeded'}));insert(row(id,4,'setup_waiting',{action:'none',operation_id:'',stage:step,status:'waiting'}));
 }
 insert(seen('recover-private'));insert(row('recover-private',2,'operation_started'));
 insert(row('recover-private',3,'operation_finished',{status:'failed',stage:'release_check',error_code:'unknown',fault:{fingerprint:'a'.repeat(64),errors:[{message:'请先升级启动器到 2.2.2 或更新版本。'}]}}));
 insert(row('recover-private',4,'operation_finished',{status:'succeeded',stage:'install_verify',launcher_version:'2.2.2',product_version:'2.5.2'}));
 const url=new URL('https://dashboard.test/?from=2026-10-16&to=2026-10-16');
 const fetcher=(url,options)=>worker.fetch(new Request(url,options),env);
 const funnelResponse=await launcherStats(url,'fixture-key',fetcher);assert.equal(funnelResponse.status,200);const funnel=await funnelResponse.json();
 assert.deepEqual(funnel.waiting_steps.map(r=>[r.step,r.installations]).sort(),[['wait_model',1],['wait_pair',1]]);
 const response=await installationProblems(url,'fixture-key',fetcher);assert.equal(response.status,200);const diagnostics=await response.json();
 assert.equal(diagnostics.issues[0].title,'启动器版本过旧');assert.match(diagnostics.issues[0].cause,/2\.2\.2/);assert.equal(diagnostics.issues[0].recovered_installations,1);
 assert.ok(!JSON.stringify([funnel,diagnostics]).includes('private'));assert.ok(!JSON.stringify(diagnostics).includes('fault'));
});

test('new-installation diagnostics use the identical cohort and retain later same-action recovery',async t=>{
 t.mock.method(Date,'now',()=>now);
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const name of ['0005_launcher_events.sql','0006_launcher_error_details.sql','0007_launcher_fault_packets.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const prepare=(sql,args=[])=>({bind(...v){return prepare(sql,v)},async all(){return {results:db.prepare(sql).all(...args)}}});
 const env={DB:{prepare},STATS_READ_KEY:'fixture-key'};
 const insert=e=>{const keys=Object.keys(e);db.prepare(`INSERT INTO launcher_events(${keys}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>k==='fault'?JSON.stringify(e[k]):e[k]))};
 for(const id of ['selected','old-birth','existing']){
  insert({...seen(id),...(id==='old-birth'?{occurred_at:now-2*day}:{}),...(id==='existing'?{cohort:'existing'}:{})});
  insert(row(id,2,'operation_started'));
  insert(row(id,3,'operation_finished',{status:'failed',stage:'release_check',error_code:'unknown',fault:{fingerprint:'a'.repeat(64),errors:[{message:'请先升级启动器到 2.2.2 或更新版本。'}]}}));
 }
 insert(row('selected',4,'operation_started',{operation_id:'retry',launcher_version:'2.2.2',occurred_at:now+day}));
 insert(row('selected',5,'operation_finished',{operation_id:'retry',status:'succeeded',launcher_version:'2.2.2',product_version:'2.5.2',occurred_at:now+day+100}));
 const get=suffix=>{const url=new URL('https://noratavern.com/api/launcher/stats?from=2026-10-16&to=2026-10-16&view=problems&scope=new_installations&window_days=7');for(const [k,v] of new URLSearchParams(suffix))url.searchParams.set(k,v);return worker.fetch(new Request(url,{headers:{Authorization:'Bearer fixture-key'}}),env)};
 const r=await get('');assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.scope,'new_installations');assert.equal(d.summary.affected_installations,1);assert.equal(d.problems[0].affected_installations,1);
 assert.equal(d.problems[0].recovered_installations,1);assert.equal(d.problems[0].sample.fault.errors[0].message,'请先升级启动器到 2.2.2 或更新版本。');
 assert.equal((await get('&window_days=0')).status,400);
 assert.equal((await get('&scope=invalid')).status,400);
});
