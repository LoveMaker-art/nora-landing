import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {summarizeFunnel} from '../server/launcher-funnel.mjs';
import worker from '../server/worker.mjs';
const DAY=86400000,now=Date.parse('2026-09-30T04:00:00Z');
function row(id,sequence,event,extra={}){return {installation_id:id,sequence,event,occurred_at:now-10000,action:'install',operation_id:'task',status:'running',stage:'prepare',stage_elapsed_ms:0,progress_age_ms:null,error_code:'none',cohort:'new',...extra};}
const seen=(id,time=now-10000)=>row(id,1,'launcher_first_seen',{action:'none',operation_id:'',occurred_at:time});
const options={from:'2026-09-22',to:'2026-09-30',windowDays:7,now};
test('counts installation identities once, excludes auxiliary errors and preserves pre-terminal readiness',()=>{
 const events=[seen('a'),row('a',2,'operation_started'),row('a',3,'stage_finished',{stage:'download',status:'succeeded',stage_elapsed_ms:1000}),row('a',4,'runtime_first_ready',{action:'none',status:'succeeded'}),row('a',5,'operation_finished',{status:'succeeded'}),row('a',6,'operation_started',{action:'update'}),row('a',7,'operation_finished',{action:'repair',status:'failed'})];
 const d=summarizeFunnel(events,options);assert.deepEqual(d.summary,{first_opened:1,install_started:1,install_completed:1,runtime_ready:1});assert.equal(d.states.ready,1);assert.deepEqual(d.states_by_stage,[{stage:'runtime_ready',state:'ready',installations:1}]);assert.equal(d.failures.length,0);
 assert.equal(d.stages[3].conversion_from_previous,1);assert.equal(d.durations[0].median_ms,1000);
});
test('observation window freezes evidence, unstarted installs stay distinct from failures and loss of contact',()=>{
 const old=now-8*DAY;
 const d=summarizeFunnel([seen('idle',old),seen('lost',now-200000),row('lost',2,'operation_started',{occurred_at:now-130000}),seen('cancel'),row('cancel',2,'operation_started'),row('cancel',3,'operation_finished',{status:'cancelled'}),seen('wait'),row('wait',2,'setup_waiting',{action:'none',status:'waiting'}),seen('late',old),row('late',2,'operation_started',{occurred_at:old+1000}),row('late',3,'operation_finished',{status:'succeeded',occurred_at:now})],options);
 assert.equal(d.observation.finalized,2);assert.equal(d.states.not_continued,1);assert.equal(d.states.contact_lost,2);assert.equal(d.states.cancelled,1);assert.equal(d.states.waiting_for_user,1);assert.equal(d.summary.install_completed,0);
});
test('failed retry remains diagnostic, later installation success changes current state; quantiles do not use averages',()=>{
 const d=summarizeFunnel([seen('a'),row('a',2,'operation_started'),row('a',3,'operation_finished',{status:'failed',error_code:'network',stage:'download'}),row('a',4,'operation_started',{operation_id:'retry'}),row('a',5,'stage_finished',{operation_id:'retry',status:'succeeded',stage:'download',stage_elapsed_ms:10}),row('a',6,'stage_finished',{operation_id:'retry',status:'succeeded',stage:'download',stage_elapsed_ms:100}),row('a',7,'stage_finished',{operation_id:'retry',status:'succeeded',stage:'download',stage_elapsed_ms:1000}),row('a',8,'operation_finished',{operation_id:'retry',status:'succeeded'})],options);
 assert.equal(d.summary.install_completed,1);assert.equal(d.states.failed,undefined);assert.equal(d.failures[0].failed_operations,1);
 const q=d.durations.find(x=>x.stage==='download');assert.equal(q.median_ms,100);assert.equal(q.p90_ms,1000);
});
test('actual query follows first-open cohort across date boundaries, excludes existing and outside cohort; legacy query stays available',async t=>{
 t.mock.method(Date,'now',()=>now);
 const db=new DatabaseSync(':memory:');for(const f of ['0005_launcher_events.sql','0006_launcher_error_details.sql','0007_launcher_fault_packets.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...v){return statement(sql,v);},async all(){return {results:db.prepare(sql).all(...args)};}});
 const env={DB:{prepare:statement},STATS_READ_KEY:'test-key'};
 const birth=Date.parse('2026-09-25T10:00:00Z');
 function insert(e){const value={event_id:crypto.randomUUID(),received_at:Date.now(),platform:'win32',arch:'x64',launcher_version:'1.1.2',product_version:'2.3.17',elapsed_ms:0,...e};const keys=Object.keys(value);db.prepare(`INSERT INTO launcher_events(${keys}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>value[k]));}
 for(const id of ['new','old','outside']){insert(seen(id,id==='outside'?birth-DAY:birth));if(id==='old')db.prepare('UPDATE launcher_events SET cohort=? WHERE installation_id=?').run('existing',id);
  insert(row(id,2,'operation_started',{occurred_at:birth+DAY}));insert(row(id,3,'operation_finished',{status:'succeeded',occurred_at:birth+DAY+1000}));}
 const get=async query=>worker.fetch(new Request('https://noratavern.com/api/launcher/stats?from=2026-09-25&to=2026-09-25'+query,{headers:{Authorization:'Bearer test-key'}}),env);
 const r=await get('&view=funnel');assert.equal(r.status,200);const d=await r.json();assert.equal(d.summary.first_opened,1);assert.equal(d.summary.install_completed,1);assert.equal(d.observation.observing,1);
 assert.equal((await get('&view=funnel&window_days=0')).status,400);assert.equal((await get('&view=funnel&operation_id=x')).status,400);assert.equal((await get('&view=funnel&platform=secret')).status,400);
 assert.equal((await get('')).status,200);db.close();
});
