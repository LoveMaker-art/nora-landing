import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeProblems} from '../server/launcher-problems.mjs';

const now=Date.parse('2026-10-21T02:00:00Z');
const row=(sequence,extra={})=>({event_id:'event-'+sequence,installation_id:'environment-a',operation_id:'task-'+sequence,
 sequence,event:'operation_finished',occurred_at:now-1000+sequence,platform:'win32',action:'model',stage:'model_test',
 status:'failed',error_code:'connection_refused',error_source:'model_service',error_site:'model.test',system_code:'ECONNREFUSED',
 http_status:null,exit_code:null,exit_signal:'',error_kind:'Error',launcher_version:'2.2.5',product_version:'2.5.5',...extra});
const summarize=(errors,evidence)=>summarizeProblems(errors,evidence,{now,
 monitorState:e=>e.status==='running'?(e.progress_age_ms>120000?'contact_lost':'running'):e.status});

test('42 failed attempts become one environment with a later successful outcome',async()=>{
 const errors=Array.from({length:42},(_,i)=>row(i+1));
 const success=row(43,{status:'succeeded',error_code:'none'});
 const d=await summarize(errors,[...errors,success]);
 assert.deepEqual(d.outcomes,{affected_installations:1,later_succeeded_installations:1,latest_failed_installations:0,
  in_progress_installations:0,unconfirmed_installations:0});
 assert.equal(d.problems[0].outcomes.later_succeeded_installations,1);
 assert.equal(d.problems[0].attempts,42);
});

test('environment totals are deduplicated across problems and require success for every affected action',async()=>{
 const model=row(1),update=row(2,{action:'update',stage:'verify',error_code:'verification_failed'});
 let d=await summarize([model,update],[model,update,row(3,{status:'succeeded'})]);
 assert.equal(d.problems.length,2);assert.equal(d.outcomes.affected_installations,1);
 assert.equal(d.outcomes.latest_failed_installations,1);assert.equal(d.outcomes.later_succeeded_installations,0);
 d=await summarize([model,update],[model,update,row(3,{status:'succeeded'}),row(4,{action:'update',status:'succeeded'})]);
 assert.equal(d.outcomes.later_succeeded_installations,1);
});

test('unrelated success, missing terminal and old failed action do not invent a current failure',async()=>{
 const orphan=row(1,{event:'launcher_error'}),start=row(2,{action:'start',status:'succeeded'});
 const d=await summarize([orphan],[start]);
 assert.equal(d.outcomes.unconfirmed_installations,1);assert.equal(d.outcomes.latest_failed_installations,0);
 assert.equal(d.outcomes.later_succeeded_installations,0);
});

test('active retries and lost contact are separate outcomes; duplicate reports do not inflate environments',async()=>{
 const a=row(1),b=row(2,{installation_id:'environment-b'}),c=row(3,{installation_id:'environment-c'});
 const running=row(4,{event:'operation_started',status:'running',progress_age_ms:0});
 const lost=row(5,{installation_id:'environment-b',event:'operation_started',status:'running',progress_age_ms:999999});
 const d=await summarize([a,a,b,c],[c,b,a,lost,running]);
 assert.deepEqual(d.outcomes,{affected_installations:3,later_succeeded_installations:0,latest_failed_installations:1,
  in_progress_installations:1,unconfirmed_installations:1});
 assert.equal(d.problems[0].installations.find(i=>i.installation_id==='environment-b').outcome,'unconfirmed');
});

test('a new same-action failure after success resets the summary, including errors outside the selected range',async()=>{
 const failure=row(1),success=row(2,{status:'succeeded'}),relapse=row(3);
 const d=await summarize([failure],[relapse,success,failure]);
 assert.equal(d.outcomes.latest_failed_installations,1);assert.equal(d.outcomes.later_succeeded_installations,0);
});

test('empty evidence has true zero totals and no diagnostic counts in the outcome contract',async()=>{
 const d=await summarize([],[]);
 assert.equal(d.outcomes.affected_installations,0);
 assert.equal(Object.values(d.outcomes).reduce((a,b)=>a+b,0),0);
 assert.equal(d.outcomes.failed_attempts,undefined);assert.equal(d.outcomes.error_events,undefined);
});
