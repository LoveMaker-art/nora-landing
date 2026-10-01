// Cohorts use first-seen installation identities, never website visitors.
const DAY=86400000;
export function summarizeFunnel(rows, {from,to,windowDays,now}) {
 const groups=new Map();
 for(const row of rows){if(!groups.has(row.installation_id))groups.set(row.installation_id,[]);groups.get(row.installation_id).push(row);}
 const totals={first_opened:0,install_started:0,install_completed:0,runtime_ready:0};
 const states={},statesByStage=new Map(),daily=new Map(),durations=new Map(),failures=new Map();let observing=0,finalized=0;
 for(const events of groups.values()){
  events.sort((a,b)=>a.sequence-b.sequence);
  const first=events.find(e=>e.event==='launcher_first_seen');if(!first)continue;
  const cutoff=Math.min(now,first.occurred_at+windowDays*DAY),mature=now>=first.occurred_at+windowDays*DAY;
  mature?finalized++:observing++;
  const day=new Date(first.occurred_at+28800000).toISOString().slice(0,10);
  if(!daily.has(day))daily.set(day,{date:day,first_opened:0,install_started:0,install_completed:0,runtime_ready:0,observing:0,finalized:0});
  const bucket=daily.get(day);mature?bucket.finalized++:bucket.observing++;
  const observed=events.filter(e=>e.sequence>=first.sequence&&e.occurred_at>=first.occurred_at&&e.occurred_at<=cutoff);
  const starts=observed.filter(e=>e.event==='operation_started'&&e.action==='install');
  const operations=new Set(starts.map(e=>e.operation_id));
  const completed=observed.find(e=>e.event==='operation_finished'&&e.action==='install'&&e.status==='succeeded'&&starts.some(s=>s.operation_id===e.operation_id&&s.sequence<e.sequence));
  // The launcher can emit readiness immediately before the install terminal event.
  const ready=completed&&observed.find(e=>e.event==='runtime_first_ready'&&starts.some(s=>s.sequence<e.sequence));
  const reached={first_opened:true,install_started:starts.length>0,install_completed:!!completed,runtime_ready:!!ready};
  for(const [key,value] of Object.entries(reached))if(value){totals[key]++;bucket[key]++;}
  // Only onboarding state changes participate: auxiliary checks/update/repair cannot replace install state.
  const relevant=observed.filter(e=>e.event==='setup_waiting'||e.event==='launcher_first_seen'||(e.action==='install'&&operations.has(e.operation_id)&&e.event!=='launcher_error'));
  const latest=relevant.at(-1);let state;
  if(ready)state='ready';
  else if(latest?.event==='setup_waiting')state='waiting_for_user';
  else if(latest?.status==='failed')state='failed';
  else if(latest?.status==='cancelled')state='cancelled';
  else if(latest?.status==='interrupted')state='interrupted';
  else if(latest?.event!=='launcher_first_seen'&&latest?.status==='running'){
   if(cutoff-latest.occurred_at>120000)state='contact_lost';
   else if(latest.progress_age_ms!==null&&latest.progress_age_ms>120000)state='possibly_stalled';
   else if(latest.stage_elapsed_ms>300000)state='slow';
   else state='running';
  }else state=mature?'not_continued':'awaiting_next_step';
  states[state]=(states[state]||0)+1;
  const reachedStage=ready?'runtime_ready':completed?'install_completed':starts.length?'install_started':'first_opened';
  const stateKey=JSON.stringify([reachedStage,state]);
  if(!statesByStage.has(stateKey))statesByStage.set(stateKey,{stage:reachedStage,state,installations:0});
  statesByStage.get(stateKey).installations++;
  for(const e of observed){
   if(e.action!=='install'||!operations.has(e.operation_id))continue;
   if(e.event==='operation_finished'&&e.status==='failed'){
    const key=JSON.stringify([e.stage,e.error_code]);if(!failures.has(key))failures.set(key,{stage:e.stage,error_code:e.error_code,operations:new Set(),installations:new Set()});
    failures.get(key).operations.add(e.installation_id+':'+e.operation_id);failures.get(key).installations.add(e.installation_id);
   }
   if(e.event==='stage_finished'&&['succeeded','failed','cancelled','interrupted'].includes(e.status)){
    if(!durations.has(e.stage))durations.set(e.stage,new Map());
    // End records already contain stage duration; sequence uniquely identifies a stage attempt.
    durations.get(e.stage).set(e.installation_id+':'+e.sequence,e.stage_elapsed_ms);
   }
  }
 }
 const ordered=['first_opened','install_started','install_completed','runtime_ready'];
 const stages=ordered.map((stage,i)=>({stage,installations:totals[stage],conversion_from_previous:i&&totals[ordered[i-1]]?totals[stage]/totals[ordered[i-1]]:null}));
 return {schema_version:1,timezone:'Asia/Shanghai',from,to,generated_at:now,
  measurement:'client_reported_new_installation_cohort_not_people',observation:{window_days:windowDays,observing,finalized,late_reports_may_revise:true},
  summary:totals,stages,daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),states,states_by_stage:[...statesByStage.values()],
  durations:[...durations].map(([stage,samples])=>{const v=[...samples.values()].sort((a,b)=>a-b),n=v.length;return {stage,samples:n,median_ms:n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2,p90_ms:v[Math.ceil(n*.9)-1]};}),
  failures:[...failures.values()].map(f=>({stage:f.stage,error_code:f.error_code,failed_operations:f.operations.size,affected_installations:f.installations.size})),
  limits:{file_download_completion:'not_observed',gameplay_success:'not_observed',missing_events:'not_inferred',model_configuration:'not_reported_in_this_view'}};
}
export async function launcherFunnel(env,params,{start,end,from,to,now=Date.now()}){
 const raw=params.get('window_days')||'7';if(!/^[0-9]+$/.test(raw)||Number(raw)<1||Number(raw)>30)return {error:'invalid_window',status:400};
 if(['operation_id','installation_id','offset','cursor'].some(key=>params.has(key)))return {error:'incompatible_filters',status:400};
 const windowDays=Number(raw),bindings=[start,end];let filters='';
 // Filters apply to first-open attributes, not changing versions later in the cohort.
 for(const key of ['platform','launcher_version','product_version']){const value=params.get(key);if(value){filters+=` AND c.${key}=?`;bindings.push(value);}}
 const sql=`WITH cohort AS (
 SELECT c.* FROM launcher_events c WHERE c.event='launcher_first_seen' AND c.cohort='new'
 AND c.occurred_at>=? AND c.occurred_at<? ${filters}
 AND NOT EXISTS(SELECT 1 FROM launcher_events older WHERE older.installation_id=c.installation_id AND older.event='launcher_first_seen' AND older.sequence<c.sequence)
 ) SELECT e.* FROM cohort c JOIN launcher_events e ON e.installation_id=c.installation_id
 WHERE e.sequence>=c.sequence AND e.occurred_at>=c.occurred_at AND e.occurred_at<=MIN(c.occurred_at+?,?)
 AND (e.event IN ('launcher_first_seen','runtime_first_ready','setup_waiting') OR e.action='install')
 ORDER BY e.installation_id,e.sequence LIMIT 50001`;
 const rows=await env.DB.prepare(sql).bind(...bindings,windowDays*DAY,now).all();
 if(rows.results.length>50000)return {error:'cohort_too_large',status:422,message:'Narrow the cohort dates or platform; no partial funnel returned.'};
 return {data:summarizeFunnel(rows.results,{from,to,windowDays,now})};
}
