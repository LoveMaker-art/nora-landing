import contract from './launcher-contract.json' with { type: 'json' };

const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^(?:unknown|\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]{1,40})?)$/;
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
 status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...headers},
});
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;

export function validLauncherEvent(e, now = Date.now()) {
 if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some(k => !contract.fields.includes(k))) return false;
 if (e.schema_version !== 1 || !UUID.test(e.event_id || '') || !UUID.test(e.installation_id || '') || !integer(e.sequence, Number.MAX_SAFE_INTEGER) || e.sequence === 0) return false;
 if (!integer(e.occurred_at, now + 300000) || e.occurred_at < now - 7 * DAY) return false;
 for (const [key, list] of Object.entries({event:'events', action:'actions', stage:'stages', status:'statuses', error_code:'errors', cohort:'cohorts', platform:'platforms', arch:'arches'})) {
  if (!contract[list].includes(e[key])) return false;
 }
 if (!VERSION.test(e.launcher_version || '') || !VERSION.test(e.product_version || '')) return false;
 if (!integer(e.elapsed_ms, 30 * DAY) || !integer(e.stage_elapsed_ms, e.elapsed_ms) || !(e.progress_age_ms === null || integer(e.progress_age_ms, e.stage_elapsed_ms))) return false;
 const task = ['operation_started','stage_started','stage_finished','heartbeat','operation_finished'].includes(e.event);
 if (task ? !UUID.test(e.operation_id || '') || e.action === 'none' : e.operation_id !== '' || e.action !== 'none') return false;
 if (e.event === 'operation_finished' && !['succeeded','failed','cancelled','interrupted','handoff'].includes(e.status)) return false;
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
  const columns = contract.fields.filter(k => !['schema_version','installation_id'].includes(k));
  await env.DB.prepare(`INSERT OR IGNORE INTO launcher_events(installation_id,received_at,${columns.join(',')}) VALUES(${Array(columns.length+2).fill('?').join(',')})`)
   .bind(id,now,...columns.map(k => k === 'occurred_at' ? Math.min(e[k],now) : e[k])).run();
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
 const query = (sql, bindings = values) => env.DB.prepare(sql).bind(...bindings).all();
 if (params.has('operation_id')) {
  const operation = params.get('operation_id'), installation = params.get('installation_id') || '';
  if (!UUID.test(operation) || (installation && !/^[a-f0-9]{64}$/.test(installation))) return json({error:'invalid_task'},400);
  const offset = Number(params.get('offset') || 0);
  if (!integer(offset,100000)) return json({error:'invalid_offset'},400);
  const rows = await query(`SELECT * FROM launcher_events WHERE operation_id=?${installation ? ' AND installation_id=?' : ''} ORDER BY sequence LIMIT 501 OFFSET ?`, [operation,...(installation ? [installation] : []),offset]);
  return json({schema_version:1,timeline:rows.results.slice(0,500),next_offset:rows.results.length>500?offset+500:null});
 }
 const summary = await query(`SELECT COUNT(DISTINCT CASE WHEN event='launcher_first_seen' AND cohort='new' THEN installation_id END) AS new_environments,
 COUNT(DISTINCT CASE WHEN event='operation_finished' AND action='install' AND status='succeeded' AND cohort='new' THEN installation_id END) AS completed_installations,
 COUNT(DISTINCT CASE WHEN event='runtime_first_ready' AND cohort='new' THEN installation_id END) AS first_ready_installations,
 COUNT(DISTINCT CASE WHEN event='operation_finished' AND status='failed' THEN installation_id||operation_id END) AS failed_operations FROM launcher_events WHERE ${where}`);
 const failures = await query(`SELECT action,stage,error_code,platform,launcher_version,COUNT(DISTINCT installation_id||operation_id) AS count FROM launcher_events WHERE ${where} AND event='operation_finished' AND status='failed' GROUP BY action,stage,error_code,platform,launcher_version ORDER BY count DESC LIMIT 100`);
 const durations = await query(`SELECT stage,COUNT(*) AS samples,AVG(stage_elapsed_ms) AS mean_ms,MAX(stage_elapsed_ms) AS max_ms FROM launcher_events WHERE ${where} AND event='stage_finished' AND status='succeeded' GROUP BY stage`);
 // Select the latest sequence before filtering; delayed packets cannot reopen a finished task.
 const latest = await query(`SELECT * FROM launcher_events e WHERE ${where} AND NOT EXISTS (SELECT 1 FROM launcher_events newer WHERE newer.installation_id=e.installation_id AND newer.sequence>e.sequence) ORDER BY received_at DESC LIMIT 201`);
 return json({schema_version:1,timezone:'Asia/Shanghai',from,to,generated_at:Date.now(),measurement:'client_reported_installation_environments_not_people',
  summary:summary.results[0],failures:failures.results,durations:durations.results,
  current:latest.results.slice(0,200).map(row => ({...row,monitor_state:monitorState(row)})),current_truncated:latest.results.length>200});
}
