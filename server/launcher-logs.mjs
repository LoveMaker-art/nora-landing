const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const MISSING=new Set(['log_path_rejected','log_read_failed','log_record_invalid','log_history_trimmed','log_order_unknown',
  'console_record_too_large','service_output_omitted','sensitive_content_omitted','redaction_failed','source_missing','chunk_limit']);
const encoder=new TextEncoder();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
async function body(request){
  if(!request.body)throw Error('body');
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('size');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function valid(value){
  const fields=['schema','installation_id','operation_id','log_id','chunk_id','index','text','final','missing'];
  return value&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key))
    &&value.schema===1&&UUID.test(value.installation_id)&&UUID.test(value.operation_id)&&UUID.test(value.log_id)&&HASH.test(value.chunk_id)
    &&Number.isInteger(value.index)&&value.index>=0&&value.index<4096&&typeof value.final==='boolean'
    &&typeof value.text==='string'&&encoder.encode(value.text).length<=16384
    &&!/(?:https?|wss?):\/\/|[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|private|var|etc)\/|\b(?:sk-|ghp_|gho_)[A-Za-z0-9_-]+|\b(?:Bearer|Basic)\s+(?!\[)|["'](?:messages|content|prompt)["']\s*:/i.test(value.text)
    &&Array.isArray(value.missing)&&value.missing.length<=12&&value.missing.every(reason=>MISSING.has(reason));
}
export async function collectOperationLogs(request,env,visitorHash){
  if(env.LAUNCHER_TELEMETRY_PAUSED==='true')return json({error:'paused'},503);
  const ip=request.headers.get('CF-Connecting-IP');
  if(ip&&env.EVENT_RATE_LIMITER&&!(await env.EVENT_RATE_LIMITER.limit({key:ip})).success)return json({error:'rate_limited'},429);
  if(!env.DB||!env.VISITOR_HASH_SECRET)return json({error:'not_configured'},503);
  let value;try{value=await body(request);}catch{return json({error:'invalid_body'},400);}
  if(!valid(value)||await hash(JSON.stringify([value.operation_id,value.log_id,value.index,value.text,value.final,value.missing]))!==value.chunk_id)return json({error:'invalid_chunk'},400);
  // Use the same identity namespace as launcher events and fault timelines.
  const installation=await visitorHash(`launcher:${value.installation_id}`,env.VISITOR_HASH_SECRET);
  // Immutability and an atomic final-index guard make lost ACK retries safe.
  await env.DB.prepare(`INSERT OR IGNORE INTO launcher_operation_logs
    (installation_id,operation_id,log_id,chunk_index,chunk_id,text,final,missing,received_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (
      SELECT 1 FROM launcher_operation_logs WHERE installation_id=? AND operation_id=? AND log_id=?
      AND (final=1 AND chunk_index<? OR ?=1 AND chunk_index>?))`)
    .bind(installation,value.operation_id,value.log_id,value.index,value.chunk_id,value.text,Number(value.final),JSON.stringify(value.missing),Date.now(),
      installation,value.operation_id,value.log_id,value.index,Number(value.final),value.index).run();
  const result=await env.DB.prepare('SELECT chunk_id FROM launcher_operation_logs WHERE installation_id=? AND operation_id=? AND log_id=? AND chunk_index=?')
    .bind(installation,value.operation_id,value.log_id,value.index).all();
  if(result.results[0]?.chunk_id!==value.chunk_id)return json({error:'identity_conflict'},409);
  return json({accepted:true,index:value.index,chunk_id:value.chunk_id},202);
}
export async function operationLogs(request,env){
  if(!env.DB)return json({error:'not_configured'},503);
  const params=new URL(request.url).searchParams,operation=params.get('operation_id'),installation=params.get('installation_id'),requestedLog=params.get('log_id');
  const rawOffset=params.get('offset')??'0',offset=Number(rawOffset);
  if(!UUID.test(operation||'')||installation&&!HASH.test(installation)||requestedLog&&!UUID.test(requestedLog)||!/^\d+$/.test(rawOffset)||!Number.isInteger(offset)||offset<0||offset>4096)return json({error:'invalid_filter'},400);
  const identities=await env.DB.prepare('SELECT DISTINCT installation_id FROM launcher_operation_logs WHERE operation_id=?').bind(operation).all();
  if(!installation&&identities.results.length>1)return json({error:'installation_id_required'},409);
  const id=installation||identities.results[0]?.installation_id;
  if(!id)return json({operation_id:operation,chunks:[],complete:false,missing:['not_received'],next_offset:offset,has_more:false});
  const logs=await env.DB.prepare('SELECT log_id,max(received_at) AS last_received FROM launcher_operation_logs WHERE installation_id=? AND operation_id=? GROUP BY log_id ORDER BY last_received DESC,log_id LIMIT 64').bind(id,operation).all();
  const log=requestedLog||logs.results[0]?.log_id;
  if(!log)return json({operation_id:operation,installation_id:id,available_logs:logs.results,chunks:[],received_chunks:0,final_index:null,complete:false,sequence_complete:false,missing:['not_received'],next_offset:offset,has_more:false});
  const summary=await env.DB.prepare('SELECT count(*) AS received_chunks, min(chunk_index) AS first_index, max(CASE WHEN final=1 THEN chunk_index END) AS final_index FROM launcher_operation_logs WHERE installation_id=? AND operation_id=? AND log_id=?').bind(id,operation,log).all();
  const rows=await env.DB.prepare('SELECT chunk_index,chunk_id,text,final,missing FROM launcher_operation_logs WHERE installation_id=? AND operation_id=? AND log_id=? AND chunk_index>=? ORDER BY chunk_index LIMIT 17').bind(id,operation,log,offset).all();
  const facts=summary.results[0],chunks=rows.results.slice(0,16).map(row=>({...row,final:Boolean(row.final),missing:JSON.parse(row.missing)}));
  const gaps=await env.DB.prepare("SELECT DISTINCT missing FROM launcher_operation_logs WHERE installation_id=? AND operation_id=? AND log_id=? AND missing<>'[]'").bind(id,operation,log).all();
  const missing=facts.received_chunks ? [...new Set(gaps.results.flatMap(row=>JSON.parse(row.missing)))] : ['not_received'];
  const sequenceComplete=facts.final_index!==null&&facts.first_index===0&&facts.received_chunks===facts.final_index+1;
  return json({operation_id:operation,installation_id:id,log_id:log,available_logs:logs.results,received_chunks:facts.received_chunks,final_index:facts.final_index,
    complete:sequenceComplete&&!missing.length,sequence_complete:sequenceComplete,missing,chunks,
    next_offset:chunks.length?chunks.at(-1).chunk_index+1:offset,has_more:rows.results.length>16});
}
