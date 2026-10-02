// Aggregation is a query projection. Raw events and the installation funnel stay intact.
const LIMIT = 50000;
const isError = e => e.event === 'launcher_error' || (e.event === 'operation_finished' && e.status === 'failed');
const parseFault = e => typeof e.fault === 'string' ? JSON.parse(e.fault) : e.fault || null;
const fingerprintFor = e => e.fingerprint || parseFault(e)?.fingerprint;
const taskKey = e => JSON.stringify([e.installation_id,e.operation_id]);
function technicalKey(e) {
 return [e.platform,e.action,e.error_source || '',e.error_site || '',e.error_code,
  e.system_code || '',e.http_status ?? null,e.exit_code ?? null,e.exit_signal || '',e.error_kind || ''];
}
function signature(e,fingerprint=fingerprintFor(e)) {
 // Fingerprints can follow one failure across stages/versions. Without one, grouping is coarse evidence only.
 return JSON.stringify([...technicalKey(e),
  fingerprint || e.stage, fingerprint ? 'fault_fingerprint' : 'technical_signature']);
}
async function digest(value) {
 const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const unique = (rows,key) => [...new Set(rows.map(e=>e[key]))].sort();

export async function summarizeProblems(errors,evidence,{monitorState,now=Date.now()}) {
 const byEnvironment=new Map(), groups=new Map(),taskFingerprints=new Map();
 const evidenceKey=e=>JSON.stringify([taskKey(e),...technicalKey(e)]);
 for(const e of errors){
  const fingerprint=fingerprintFor(e);if(!fingerprint)continue;
  const key=evidenceKey(e);if(!taskFingerprints.has(key))taskFingerprints.set(key,new Set());
  taskFingerprints.get(key).add(fingerprint);
 }
 for(const e of evidence){
  if(!byEnvironment.has(e.installation_id))byEnvironment.set(e.installation_id,[]);
  byEnvironment.get(e.installation_id).push(e);
 }
 for(const rows of byEnvironment.values())rows.sort((a,b)=>a.sequence-b.sequence);
 for(const e of errors){
  const candidates=taskFingerprints.get(evidenceKey(e));
  // Missing-detail companions can use a unique fingerprint from the very same task only.
  const fingerprint=fingerprintFor(e) || (candidates?.size===1 ? [...candidates][0] : undefined);
  const key=signature(e,fingerprint);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);
 }
 const problems=[];
 for(const [key,rows] of groups){
  const problem_id=await digest(key),environments=new Map();
  for(const e of rows){if(!environments.has(e.installation_id))environments.set(e.installation_id,[]);environments.get(e.installation_id).push(e);}
  const installations=[];
  for(const [installation_id,failures] of environments){
   failures.sort((a,b)=>a.sequence-b.sequence);
   const last=failures.at(-1),history=byEnvironment.get(installation_id)||[];
   const tasks=new Set(failures.map(e=>e.operation_id));
   const terminals=new Map();for(const e of history)if(e.event==='operation_finished')terminals.set(e.operation_id,e);
   const latestAction=history.filter(e=>e.action===last.action&&e.event!=='launcher_error').at(-1);
   const latest=history.filter(e=>e.event!=='launcher_error'&&!['list_models','check_update'].includes(e.action)).at(-1);
   const successes=history.filter(e=>e.event==='operation_finished'&&e.status==='succeeded'&&e.action===last.action&&e.sequence>last.sequence);
   // A later start is evidence of usability, never proof that an update/install succeeded.
   const recovered=latestAction?.event==='operation_finished'&&latestAction.status==='succeeded'&&latestAction.sequence>last.sequence;
   installations.push({installation_id,error_events:failures.length,attempts:tasks.size,
    failed_attempts:[...tasks].filter(id=>terminals.get(id)?.status==='failed').length,
    recovered_attempts:[...tasks].filter(id=>terminals.get(id)?.status==='succeeded').length,
    first_seen:Math.min(...failures.map(e=>e.occurred_at)),last_seen:last.occurred_at,
    latest_error_event_id:last.event_id,latest_error_operation_id:last.operation_id,
    recovery:recovered?'succeeded_same_action':'no_observed_recovery',
    later_same_action_success:successes.length>0,
    latest_action_outcome:latestAction ? {event:latestAction.event,status:latestAction.status,stage:latestAction.stage,operation_id:latestAction.operation_id,occurred_at:latestAction.occurred_at}:null,
    later_start_succeeded:history.some(e=>e.sequence>last.sequence&&e.event==='operation_finished'&&e.action==='start'&&e.status==='succeeded'),
    later_runtime_ready:history.some(e=>e.sequence>last.sequence&&e.event==='runtime_first_ready'),
    current:latest ? {event:latest.event,action:latest.action,stage:latest.stage,monitor_state:monitorState(latest,now),occurred_at:latest.occurred_at}:null});
  }
  installations.sort((a,b)=>b.last_seen-a.last_seen||a.installation_id.localeCompare(b.installation_id));
  const sample=[...rows].sort((a,b)=>b.occurred_at-a.occurred_at||b.sequence-a.sequence).find(e=>fingerprintFor(e)) || rows.at(-1);
  problems.push({problem_id,grouping_basis:fingerprintFor(sample)?'fault_fingerprint':'technical_signature',
   platform:sample.platform,action:sample.action,error_code:sample.error_code,error_source:sample.error_source||'',error_site:sample.error_site||'',
   system_code:sample.system_code||'',http_status:sample.http_status??null,exit_code:sample.exit_code??null,
   fingerprint:fingerprintFor(sample)||null,stages:unique(rows,'stage'),launcher_versions:unique(rows,'launcher_version'),product_versions:unique(rows,'product_version'),
   error_events:rows.length,attempts:new Set(rows.map(taskKey)).size,
   failed_attempts:installations.reduce((n,e)=>n+e.failed_attempts,0),recovered_attempts:installations.reduce((n,e)=>n+e.recovered_attempts,0),
   affected_installations:installations.length,recovered_installations:installations.filter(e=>e.recovery==='succeeded_same_action').length,
   no_observed_recovery_installations:installations.filter(e=>e.recovery==='no_observed_recovery').length,
   first_seen:Math.min(...rows.map(e=>e.occurred_at)),last_seen:Math.max(...rows.map(e=>e.occurred_at)),
   sample:{event_id:sample.event_id,operation_id:sample.operation_id,installation_id:sample.installation_id,fault:parseFault(sample)},installations});
 }
 problems.sort((a,b)=>b.no_observed_recovery_installations-a.no_observed_recovery_installations||b.last_seen-a.last_seen||a.problem_id.localeCompare(b.problem_id));
 const terminals=new Map();for(const e of evidence)if(e.event==='operation_finished')terminals.set(taskKey(e),e);
 const tasks=new Set(errors.map(taskKey));
 return {summary:{error_events:errors.length,attempts:tasks.size,failed_attempts:[...tasks].filter(k=>terminals.get(k)?.status==='failed').length,
  affected_installations:new Set(errors.map(e=>e.installation_id)).size,problems:problems.length},problems};
}

export async function launcherProblems(env,params,{where,values,from,to,monitorState}) {
 if(['operation_id','installation_id','cursor','window_days'].some(k=>params.has(k)))return {error:'incompatible_filters',status:400};
 const raw=params.get('offset')??'0',offset=Number(raw);
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(offset)||offset>LIMIT)return {error:'invalid_offset',status:400};
 const id=params.get('problem_id');if(id!==null&&!/^[a-f0-9]{64}$/.test(id))return {error:'invalid_problem',status:400};
 const errorWhere=`${where} AND (event='launcher_error' OR (event='operation_finished' AND status='failed'))`;
 const query=(sql,args)=>env.DB.prepare(sql).bind(...args).all();
 // Do not materialize thousands of 24 KiB fault packets just to count/group their fingerprints.
 const errors=(await query(`SELECT event_id,installation_id,operation_id,sequence,event,occurred_at,platform,action,stage,status,
  error_code,error_source,error_site,system_code,http_status,exit_code,exit_signal,error_kind,launcher_version,product_version,
  json_extract(fault,'$.fingerprint') AS fingerprint FROM launcher_events WHERE ${errorWhere} ORDER BY rowid LIMIT ${LIMIT+1}`,values)).results;
 if(errors.length>LIMIT)return {error:'too_many_events',status:422};
 // Follow outcomes through later versions/dates; result is a snapshot at query time, not at 'to'.
 const evidence=(await query(`SELECT installation_id,operation_id,sequence,event,status,action,stage,occurred_at,progress_age_ms,stage_elapsed_ms
  FROM launcher_events WHERE installation_id IN (SELECT DISTINCT installation_id FROM launcher_events WHERE ${errorWhere}) AND event<>'launcher_error' ORDER BY installation_id,sequence LIMIT ${LIMIT+1}`,values)).results;
 if(evidence.length>LIMIT)return {error:'too_many_events',status:422};
 const now=Date.now(),result=await summarizeProblems(errors,evidence,{monitorState,now});
 const common={schema_version:1,timezone:'Asia/Shanghai',from,to,generated_at:now,measurement:'installation_environments_not_people',
  recovery_scope:'latest_received_same_action_outcome_at_query_time',summary:result.summary,
  limits:{technical_signature:'coarse_group_not_proven_root_cause',no_observed_recovery:'not_proof_of_permanent_failure',pagination:'snapshot_offset_refresh_from_zero_when_polling'}};
 const loadSamples=async problems=>{
  if(!problems.length)return;
  const ids=problems.map(p=>p.sample.event_id);
  const rows=(await query(`SELECT event_id,fault FROM launcher_events WHERE event_id IN (${ids.map(()=>'?')})`,ids)).results;
  const samples=new Map(rows.map(e=>[e.event_id,parseFault(e)]));
  for(const p of problems)p.sample.fault=samples.get(p.sample.event_id)||null;
 };
 if(id){
  const problem=result.problems.find(p=>p.problem_id===id);if(!problem)return {error:'problem_not_found',status:404};
  await loadSamples([problem]);
  const {installations,...group}=problem;
  return {data:{...common,problem:group,installations:installations.slice(offset,offset+100),next_offset:offset+100<installations.length?offset+100:null}};
 }
 const page=result.problems.slice(offset,offset+100);await loadSamples(page);
 return {data:{...common,problems:page.map(({installations,...p})=>p),next_offset:offset+100<result.problems.length?offset+100:null}};
}
