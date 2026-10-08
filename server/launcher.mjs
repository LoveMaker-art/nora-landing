import {launcherFunnel} from './launcher-funnel.mjs';
import {launcherProblems} from './launcher-problems.mjs';
import contract from './launcher-contract.json' with { type: 'json' };

function validFaultPacket(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = (v, expected) => v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v,k));
  const string = (v,n) => typeof v === 'string' && v.length <= n
    && !/(?:https?|wss?):\/\/|[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|private|var|etc)\/|\b(?:Bearer|Basic)\s+(?!\[)|\b(?:sk-|ghp_|gho_)[A-Za-z0-9_-]+|["'](?:messages|content|prompt)["']\s*:/i.test(v);
  if (!keys(value,['schema','fingerprint','environment','errors','output','breadcrumbs','truncated',...(value.schema === 2 ? ['operation','evidence'] : [])]) || ![1,2].includes(value.schema) || typeof value.truncated !== 'boolean'
    || !/^[a-f0-9]{64}$/.test(value.fingerprint)) return false;
  if (value.schema === 2) {
    const integer = value => value === null || Number.isSafeInteger(value) && value >= 0;
    const member = (value,list) => value === null || contract[list].includes(value);
    const version = value => value === null || typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]{1,40})?$/.test(value);
    const code = value => value === null || typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(value);
    const operation = value.operation;
    if (operation !== null && (!keys(operation,['operation_id','snapshot_sequence','target_version','current_version','plan_digest','stage_id','effect_state','recovery_outcome','verification','attempt','total_attempts','primary_code','secondary_codes'])
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operation.operation_id)
      || !integer(operation.snapshot_sequence) || !integer(operation.attempt) || !integer(operation.total_attempts)
      || !version(operation.target_version) || !version(operation.current_version)
      || !(operation.plan_digest === null || /^[a-f0-9]{64}$/.test(operation.plan_digest))
      || !member(operation.stage_id,'faultOperationStages') || !member(operation.effect_state,'faultEffectStates')
      || !member(operation.recovery_outcome,'faultRecoveryOutcomes') || !member(operation.verification,'faultVerifications')
      || !code(operation.primary_code) || !Array.isArray(operation.secondary_codes) || operation.secondary_codes.length > 8 || !operation.secondary_codes.every(code))) return false;
    const info = value.evidence;
    if (!keys(info,['local_status','missing_reasons','primary_error_index','secondary_error_indexes']) || !contract.faultEvidenceStatuses.includes(info.local_status)
      || !Array.isArray(info.missing_reasons) || info.missing_reasons.length > 16 || !info.missing_reasons.every(reason => contract.faultMissingReasons.includes(reason) || /^(?:save_failed|evidence_read_failed):[A-Z_]{1,32}$/.test(reason))
      || !(info.primary_error_index === null || Number.isInteger(info.primary_error_index) && info.primary_error_index >= 0 && info.primary_error_index < value.errors?.length)
      || !Array.isArray(info.secondary_error_indexes) || info.secondary_error_indexes.length > 4 || !info.secondary_error_indexes.every(index => Number.isInteger(index) && index >= 0 && index < value.errors?.length && value.errors[index].relation === 'secondary')) return false;
  }
  const env = value.environment;
  if (!keys(env,['os_release','node','electron','launcher_build']) || !string(env.os_release,80)
    || !string(env.node,40) || !string(env.electron,40) || !/^(?:[a-f0-9]{64})?$/.test(env.launcher_build)) return false;
  if (!Array.isArray(value.errors) || value.errors.length > 4 || !value.errors.every(e =>
    keys(e,['relation','kind','message','frames','code','syscall','path']) && ['error','cause','secondary','child'].includes(e.relation)
    && contract.faultKinds.includes(e.kind) && string(e.message,1200) && Array.isArray(e.frames) && e.frames.length <= 12
    && e.frames.every(f => string(f,240)) && (e.code === '' || contract.systemCodes.includes(e.code))
    && /^(?:[a-z_]{1,32})?$/.test(e.syscall) && string(e.path,240))) return false;
  if (!Array.isArray(value.output) || value.output.length > 12 || !value.output.every(s => string(s,500))) return false;
  return Array.isArray(value.breadcrumbs) && value.breadcrumbs.length <= 16 && value.breadcrumbs.every(b =>
    keys(b,['event','stage','status','elapsed_ms']) && contract.events.includes(b.event)
    && contract.stages.includes(b.stage) && contract.statuses.includes(b.status)
    && Number.isSafeInteger(b.elapsed_ms) && b.elapsed_ms >= 0 && b.elapsed_ms <= 30 * 86400000);
}

const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^(?:unknown|\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]{1,40})?)$/;
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
 status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...headers},
});
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;

export function validLauncherEvent(e, now = Date.now()) {
 if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some(k => !contract.fields.includes(k))) return false;
 if (![1,2,3].includes(e.schema_version) || !UUID.test(e.event_id || '') || !UUID.test(e.installation_id || '') || !integer(e.sequence, Number.MAX_SAFE_INTEGER) || e.sequence === 0) return false;
 if (e.schema_version === 1 && contract.detailFields.some(key => key in e)) return false;
 if (e.schema_version >= 2) {
  for (const [key,list] of Object.entries({error_source:'sources',error_site:'sites',system_code:'systemCodes',exit_signal:'signals',error_kind:'kinds'})) {
   if (e[key] !== '' && !contract[list].includes(e[key])) return false;
  }
  if (!(e.http_status === null || integer(e.http_status,599) && e.http_status >= 400)
   || !(e.exit_code === null || integer(e.exit_code,65535)) || !integer(e.attempt,10)) return false;
  if (e.status !== 'failed' && contract.detailFields.some(key => !['',null,0].includes(e[key]))) return false;
  if (e.status === 'failed' && (!e.error_source || !e.error_site || !e.error_kind || e.attempt < 1)) return false;
 }
 if (e.schema_version < 3 && 'fault' in e) return false;
 if (e.schema_version === 3 && e.fault?.schema === 2 && e.fault.operation && e.fault.operation.operation_id !== e.operation_id) return false;
 if (e.schema_version === 3 && (e.fault !== null && (!validFaultPacket(e.fault) || new TextEncoder().encode(JSON.stringify(e.fault)).length > contract.faultLimits.packetBytes)
   || e.fault !== null && (e.status !== 'failed' || !['launcher_error','operation_finished'].includes(e.event)))) return false;
 if (!integer(e.occurred_at, now + 300000) || e.occurred_at < now - 7 * DAY) return false;
 for (const [key, list] of Object.entries({event:'events', action:'actions', stage:'stages', status:'statuses', error_code:'errors', cohort:'cohorts', platform:'platforms', arch:'arches'})) {
  if (!contract[list].includes(e[key])) return false;
 }
 if (!VERSION.test(e.launcher_version || '') || !VERSION.test(e.product_version || '')) return false;
 if (!integer(e.elapsed_ms, 30 * DAY) || !integer(e.stage_elapsed_ms, e.elapsed_ms) || !(e.progress_age_ms === null || integer(e.progress_age_ms, e.stage_elapsed_ms))) return false;
 const task = ['operation_started','stage_started','stage_finished','heartbeat','operation_finished','launcher_error'].includes(e.event);
 if (task ? !UUID.test(e.operation_id || '') || e.action === 'none' : e.operation_id !== '' || e.action !== 'none') return false;
 if (e.event === 'operation_finished' && !['succeeded','failed','cancelled','interrupted','handoff'].includes(e.status)) return false;
 if (e.event === 'launcher_error' && (e.schema_version < 2 || e.status !== 'failed')) return false;
 if (['operation_started','stage_started','heartbeat'].includes(e.event) && e.status !== 'running') return false;
 if (e.event === 'setup_waiting' && (e.status !== 'waiting' || !['wait_model','wait_pair','wait_start'].includes(e.stage))) return false;
 if (e.event === 'runtime_first_ready' && (e.status !== 'succeeded' || e.stage !== 'health_check')) return false;
 if (e.event === 'launcher_first_seen' && (e.status !== 'running' || e.stage !== 'idle')) return false;
 if (e.event === 'stage_finished' && !['succeeded','failed','cancelled','interrupted','handoff'].includes(e.status)) return false;
 if (e.status !== 'failed' && e.error_code !== 'none') return false;
 return true;
}

async function body(request) {
 if (!request.body) throw Error('body');
 const reader = request.body.getReader(), chunks = []; let length = 0;
 while (true) {
  const next = await reader.read(); if (next.done) break;
  length += next.value.length;
  if (length > 65536) { await reader.cancel(); throw Error('size'); }
  chunks.push(next.value);
 }
 const bytes = new Uint8Array(length); let offset = 0;
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
 return JSON.parse(new TextDecoder().decode(bytes));
}

export async function collectLauncher(request, env, hash) {
 if (!env.DB || !env.VISITOR_HASH_SECRET) return json({error:'not_configured'},503);
 const ip = request.headers.get('CF-Connecting-IP');
 if (ip && env.LAUNCHER_RATE_LIMITER && !(await env.LAUNCHER_RATE_LIMITER.limit({key:ip})).success) return json({error:'rate_limited'},429,{'Retry-After':'60'});
 if (env.LAUNCHER_TELEMETRY_PAUSED === 'true') return json({paused:true,retry_after_seconds:3600});
 let data;
 try { data = await body(request); } catch (e) { return json({error:'invalid_body'},e.message === 'size' ? 413 : 400); }
 if (!data || Object.keys(data).some(k => k !== 'events') || !Array.isArray(data.events) || !data.events.length || data.events.length > 20) return json({error:'invalid_batch'},400);
 const accepted = [], rejected = [], now = Date.now();
 for (const e of data.events) {
  if (!validLauncherEvent(e,now)) { if (UUID.test(e?.event_id || '')) rejected.push({event_id:e.event_id,reason:'invalid_event'}); continue; }
  const id = await hash(`launcher:${e.installation_id}`,env.VISITOR_HASH_SECRET);
  const columns = contract.fields.filter(k => !['schema_version','installation_id'].includes(k)
   && (e.schema_version >= 2 || !contract.detailFields.includes(k)) && (e.schema_version >= 3 || k !== 'fault'));
  await env.DB.prepare(`INSERT OR IGNORE INTO launcher_events(installation_id,received_at,${columns.join(',')}) VALUES(${Array(columns.length+2).fill('?').join(',')})`)
   .bind(id,now,...columns.map(k => k === 'fault' ? e.fault === null ? null : JSON.stringify(e.fault) : k === 'occurred_at' ? Math.min(e[k],now) : e[k])).run();
  const row = await env.DB.prepare('SELECT event_id FROM launcher_events WHERE installation_id=? AND sequence=?').bind(id,e.sequence).all();
  if (row.results[0]?.event_id === e.event_id) accepted.push(e.event_id);
  else rejected.push({event_id:e.event_id,reason:'identity_conflict'});
 }
 return json({accepted_event_ids:accepted,rejected_event_ids:rejected},202);
}

export function monitorState(row, now = Date.now()) {
 if (row.event === 'launcher_first_seen') return 'idle';
 if (row.event === 'setup_waiting') return 'waiting_for_user';
 if (row.status !== 'running') return row.status;
 if (now - row.occurred_at > 120000) return 'contact_lost';
 // These are warnings only. No server classification terminates a client task.
 if (row.progress_age_ms !== null && row.progress_age_ms > 120000) return 'possibly_stalled';
 if (row.stage_elapsed_ms > 300000) return 'slow';
 return 'running';
}

export async function launcherStats(request, env) {
 if (!env.DB) return json({error:'not_configured'},503);
 const params = new URL(request.url).searchParams;
 const from = params.get('from') || '', to = params.get('to') || '';
 const date = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const n = Date.parse(s+'T00:00:00+08:00');
  return Number.isFinite(n) && new Date(n+28800000).toISOString().slice(0,10) === s ? n : NaN;
 };
 const start = date(from), end = date(to) + DAY;
 if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 93*DAY) return json({error:'invalid_range'},400);
 let where = 'occurred_at>=? AND occurred_at<?'; const values = [start,end];
 for (const key of ['platform','launcher_version','product_version']) {
  const value = params.get(key); if (!value) continue;
  if (key === 'platform' ? !contract.platforms.includes(value) : !VERSION.test(value)) return json({error:'invalid_filter'},400);
  where += ` AND ${key}=?`; values.push(value);
 }
 if(params.has('view')){
  if(params.get('view')==='problems'){
   const result=await launcherProblems(env,params,{where,values,from,to,monitorState});
   return result.error?json({error:result.error},result.status):json(result.data);
  }
  if(params.get('view')==='funnel'){
   const result=await launcherFunnel(env,params,{start,end,from,to});
   return result.error?json({error:result.error,message:result.message},result.status):json(result.data);
  }
  if(params.get('view')!=='errors')return json({error:'invalid_view'},400);
 }
 const project = row => ({...row,fault:row.fault ? JSON.parse(row.fault) : null});
 const query = (sql, bindings = values) => env.DB.prepare(sql).bind(...bindings).all();
 if(params.get('view')==='errors'){
  if(['operation_id','installation_id','offset','window_days'].some(key=>params.has(key)))return json({error:'incompatible_filters'},400);
  const raw=params.get('cursor') ?? '0',cursor=Number(raw);
  if(!/^\d+$/.test(raw)||!integer(cursor,Number.MAX_SAFE_INTEGER))return json({error:'invalid_cursor'},400);
  // Intake order keeps late client events and concurrent inserts behind the saved cursor.
  const rows=await query(`SELECT e.*,e.rowid AS intake_cursor,
   (SELECT status FROM launcher_events final WHERE final.installation_id=e.installation_id AND final.operation_id=e.operation_id AND final.event='operation_finished' ORDER BY final.sequence DESC LIMIT 1) AS operation_outcome
   FROM launcher_events e WHERE ${where} AND e.rowid>? AND (event='launcher_error' OR (event='operation_finished' AND status='failed')) ORDER BY e.rowid LIMIT 101`,[...values,cursor]);
  const page=rows.results.slice(0,100);
  return json({schema_version:1,timezone:'Asia/Shanghai',from,to,generated_at:Date.now(),
   errors:page.map(({intake_cursor,...row})=>project(row)),has_more:rows.results.length>100,next_cursor:page.at(-1)?.intake_cursor ?? cursor});
 }
 if(params.has('cursor'))return json({error:'incompatible_filters'},400);
 if (params.has('operation_id')) {
  const operation = params.get('operation_id'), installation = params.get('installation_id') || '';
  if (!UUID.test(operation) || (installation && !/^[a-f0-9]{64}$/.test(installation))) return json({error:'invalid_task'},400);
  const offset = Number(params.get('offset') || 0);
  if (!integer(offset,100000)) return json({error:'invalid_offset'},400);
  const rows = await query(`SELECT * FROM launcher_events WHERE operation_id=?${installation ? ' AND installation_id=?' : ''} ORDER BY sequence LIMIT 501 OFFSET ?`, [operation,...(installation ? [installation] : []),offset]);
  return json({schema_version:1,timeline:rows.results.slice(0,500).map(project),next_offset:rows.results.length>500?offset+500:null});
 }
 const summary = await query(`SELECT COUNT(DISTINCT CASE WHEN event='launcher_first_seen' AND cohort='new' THEN installation_id END) AS new_environments,
 COUNT(DISTINCT CASE WHEN event='operation_finished' AND action='install' AND status='succeeded' AND cohort='new' THEN installation_id END) AS completed_installations,
 COUNT(DISTINCT CASE WHEN event='runtime_first_ready' AND cohort='new' THEN installation_id END) AS first_ready_installations,
 COUNT(DISTINCT CASE WHEN event='operation_finished' AND status='failed' THEN installation_id||operation_id END) AS failed_operations FROM launcher_events WHERE ${where}`);
 const failures = await query(`SELECT action,stage,error_code,error_source,error_site,system_code,http_status,exit_code,exit_signal,error_kind,platform,launcher_version,COUNT(DISTINCT installation_id||operation_id) AS count FROM launcher_events WHERE ${where} AND event='operation_finished' AND status='failed' GROUP BY action,stage,error_code,error_source,error_site,system_code,http_status,exit_code,exit_signal,error_kind,platform,launcher_version ORDER BY count DESC LIMIT 101`);
 const errors = await query(`SELECT e.*, (SELECT status FROM launcher_events final WHERE final.installation_id=e.installation_id AND final.operation_id=e.operation_id AND final.event='operation_finished' ORDER BY final.sequence DESC LIMIT 1) AS operation_outcome FROM launcher_events e WHERE ${where} AND (event='launcher_error' OR (event='operation_finished' AND status='failed')) ORDER BY received_at DESC,event_id DESC LIMIT 101`);
 const durations = await query(`SELECT stage,COUNT(*) AS samples,AVG(stage_elapsed_ms) AS mean_ms,MAX(stage_elapsed_ms) AS max_ms FROM launcher_events WHERE ${where} AND event='stage_finished' AND status='succeeded' GROUP BY stage`);
 // Error evidence is not an operation outcome: a retry must not replace task state.
 // Select the latest state sequence before filtering; delayed packets cannot reopen a finished task.
 const latest = await query(`SELECT * FROM launcher_events e WHERE ${where} AND e.event<>'launcher_error' AND e.action NOT IN ('list_models','check_update') AND NOT EXISTS (SELECT 1 FROM launcher_events newer WHERE newer.installation_id=e.installation_id AND newer.event<>'launcher_error' AND newer.action NOT IN ('list_models','check_update') AND newer.sequence>e.sequence) ORDER BY received_at DESC LIMIT 201`);
 const operations = await query(`SELECT * FROM launcher_events e WHERE ${where} AND e.operation_id<>'' AND e.event<>'launcher_error' AND NOT EXISTS (SELECT 1 FROM launcher_events newer WHERE newer.installation_id=e.installation_id AND newer.operation_id=e.operation_id AND newer.event<>'launcher_error' AND newer.sequence>e.sequence) ORDER BY received_at DESC LIMIT 201`);
 const issues = await query(`SELECT json_extract(fault,'$.fingerprint') AS fingerprint, COUNT(DISTINCT installation_id||operation_id) AS operations, COUNT(DISTINCT installation_id) AS environments, MAX(occurred_at) AS last_seen FROM launcher_events WHERE ${where} AND fault IS NOT NULL GROUP BY json_extract(fault,'$.fingerprint') ORDER BY last_seen DESC LIMIT 101`);
 return json({schema_version:1,timezone:'Asia/Shanghai',from,to,generated_at:Date.now(),measurement:'client_reported_installation_environments_not_people',
  summary:summary.results[0],failures:failures.results.slice(0,100),failures_truncated:failures.results.length>100,errors:errors.results.slice(0,100).map(project),errors_truncated:errors.results.length>100,issues:issues.results.slice(0,100),issues_truncated:issues.results.length>100,operations:operations.results.slice(0,200).map(project),operations_truncated:operations.results.length>200,durations:durations.results,
  current:latest.results.slice(0,200).map(row => ({...project(row),monitor_state:monitorState(row)})),current_truncated:latest.results.length>200});
}
