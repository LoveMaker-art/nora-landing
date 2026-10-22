import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeProblems} from '../server/launcher-problems.mjs';
import {formatOutcomeReport} from '../scripts/report-launcher-outcomes.mjs';

test('report uses the actual aggregator result, not the 42 intermediate failures',async()=>{
 const errors=Array.from({length:42},(_,i)=>({installation_id:'a',operation_id:'t'+i,sequence:i,event:'operation_finished',
  status:'failed',action:'model',platform:'win32',stage:'model_test',error_code:'timeout',occurred_at:i}));
 const success={...errors[0],sequence:50,operation_id:'retry',status:'succeeded'};
 const result=await summarizeProblems(errors,[...errors,success],{monitorState:e=>e.status});
 const text=formatOutcomeReport({...result,from:'2026-10-20',to:'2026-10-20'});
 assert.match(text,/遇到问题的安装环境：1\n后续同类操作成功：1/);
 assert.doesNotMatch(text,/42|失败操作|错误事件|a\b|retry/);
});
test('missing or inconsistent results fail closed instead of reporting zero or raw failures',()=>{
 assert.throws(()=>formatOutcomeReport({summary:{failed_operations:300}}),/do not substitute/);
 assert.throws(()=>formatOutcomeReport({outcomes:{affected_installations:1,later_succeeded_installations:1,
  latest_failed_installations:1,in_progress_installations:0,unconfirmed_installations:0}}));
});
