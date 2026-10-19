import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
const origin='https://noratavern.com';
function setup(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_events.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0004_website_outcomes.sql',import.meta.url),'utf8'));
 const statement=(text,args=[])=>({bind(...values){return statement(text,values);},async run(){return sql.prepare(text).run(...args);},async all(){return {results:sql.prepare(text).all(...args)};}});
 return {sql,env:{DB:{prepare:statement,async batch(items){return Promise.all(items.map(x=>x.all()));}},VISITOR_HASH_SECRET:'test-only-hash-secret',STATS_READ_KEY:'test-only-read-key',ASSETS:{fetch:()=>new Response('static')}}};}
function event(overrides={}){return {event_id:crypto.randomUUID(),visitor_id:crypto.randomUUID(),event:'pageview',hostname:'noratavern.com',device:'desktop',channel:'qq',...overrides};}
const post=(env,b,headers={})=>worker.fetch(new Request(origin+'/api/events',{method:'POST',headers:{Origin:origin,...headers},body:JSON.stringify(b)}),env);
const get=(env,query='',auth='Bearer test-only-read-key')=>worker.fetch(new Request(origin+'/api/stats?from=2026-09-01&to=2026-09-30'+query,{headers:{Authorization:auth}}),env);
test('deduplicates retries, hashes visitor and counts pageviews and unique download visitors',async()=>{const {sql,env}=setup();const a=event();assert.equal((await post(env,a)).status,202);await post(env,a);await post(env,{...a,event_id:crypto.randomUUID()});
 for(const platform of ['windows','windows','mac-arm64'])await post(env,event({visitor_id:a.visitor_id,event:'download_click',action:platform,platform,result:'direct'}));
 await post(env,event());sql.exec('UPDATE events SET occurred_at=1789488000000');
 const data=await (await get(env)).json();assert.equal(data.summary.pv,3);assert.equal(data.summary.uv,2);assert.equal(data.summary.download_clicks,3);assert.equal(data.summary.download_visitors,1);assert.equal(data.daily.length,30);assert.equal(data.unavailable.create_success_users.value,null);
 const stored=sql.prepare('SELECT visitor_id FROM events LIMIT 1').get().visitor_id;assert.notEqual(stored,a.visitor_id);assert.equal(stored.length,64);
 const windows=data.events.find(e=>e.action==='windows');assert.equal(windows.count,2);assert.equal(windows.visitors,1);
});
test('rejects unauthenticated queries, arbitrary events, forbidden origins and large bodies',async()=>{const {env}=setup();assert.equal((await get(env,'','')).status,401);assert.equal((await get(env,'','Bearer wrong')).status,401);assert.equal((await post(env,event({event:'create_success'}))).status,400);assert.equal((await post(env,event({hostname:'evil.com'}))).status,400);assert.equal((await post(env,event(),{Origin:'https://evil.com'})).status,403);assert.equal((await post(env,event({event:'help_open',action:'installation',result:'secret'}))).status,400);assert.equal((await post(env,event({channel:'x'.repeat(5000)}))).status,400);});
test('Shanghai midnight boundaries and range UV differ from summed daily UV',async()=>{const {env,sql}=setup();const a=event();await post(env,a);await post(env,{...a,event_id:crypto.randomUUID()});const rows=sql.prepare('SELECT event_id FROM events').all();sql.prepare('UPDATE events SET occurred_at=? WHERE event_id=?').run(Date.parse('2026-09-15T15:59:59Z'),rows[0].event_id);sql.prepare('UPDATE events SET occurred_at=? WHERE event_id=?').run(Date.parse('2026-09-15T16:00:00Z'),rows[1].event_id);
 const data=await(await get(env)).json();assert.equal(data.summary.uv,1);assert.equal(data.daily.find(d=>d.date==='2026-09-15').uv,1);assert.equal(data.daily.find(d=>d.date==='2026-09-16').uv,1);
 for(const range of ['from=2026-02-30&to=2026-03-01','from=2026-01-01&to=2026-12-31'])assert.equal((await worker.fetch(new Request(origin+'/api/stats?'+range,{headers:{Authorization:'Bearer test-only-read-key'}}),env)).status,400);
 const filtered=await(await get(env,'&channel=nonexistent')).json();assert.equal(filtered.summary.pv,0);assert.equal(filtered.daily.length,30);
});
test('static pass-through, no-cache API, and ingestion-only CORS',async()=>{const {env}=setup();assert.equal(await(await worker.fetch(new Request(origin+'/'),env)).text(),'static');const r=await get(env);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
 const p=await worker.fetch(new Request(origin+'/api/events',{method:'OPTIONS',headers:{Origin:'https://lovemaker-art.github.io'}}),env);assert.equal(p.status,204);assert.equal(p.headers.get('Access-Control-Allow-Origin'),'https://lovemaker-art.github.io');assert.equal((await worker.fetch(new Request(origin+'/api/other'),env)).status,404);
});
test('ingestion rate limit rejects before writing; browser cannot submit a success event',async()=>{const {env,sql}=setup();env.EVENT_RATE_LIMITER={limit:async()=>({success:false})};assert.equal((await post(env,event(),{'CF-Connecting-IP':'192.0.2.1'})).status,429);assert.equal(sql.prepare('SELECT count(*) AS n FROM events').get().n,0);});

test('outcomes deduplicate and delayed events retain occurrence date; old clients still work',async()=>{
 const {env,sql}=setup();const when=Date.now()-86400000;
 const e=event({event:'download_ready',action:'windows',platform:'windows',result:'ready',occurred_at:when});
 assert.equal((await post(env,e)).status,202);await post(env,e);
 await post(env,event({visitor_id:e.visitor_id,event:'download_failed',action:'windows',platform:'windows',result:'timeout'}));
 const row=sql.prepare('SELECT * FROM events WHERE event_id=?').get(e.event_id);assert.equal(row.occurred_at,when);assert.ok(row.received_at>when);
 sql.exec('UPDATE events SET occurred_at=1789488000000');const data=await(await get(env)).json();assert.equal(data.summary.download_ready_requests,1);assert.equal(data.summary.download_ready_visitors,1);assert.equal(data.summary.download_failed_requests,1);assert.equal(data.summary.download_clicks,0);
 assert.equal((await post(env,event({occurred_at:Date.now()-8*86400000}))).status,400);
 assert.equal((await post(env,{...e,event_id:crypto.randomUUID(),result:'download_complete'})).status,400);
});

test('migration preserves historical rows and indexes',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_events.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO events(event_id,visitor_id,occurred_at,event,hostname) VALUES('old','visitor',123,'pageview','noratavern.com')");
 db.exec(readFileSync(new URL('../migrations/0004_website_outcomes.sql',import.meta.url),'utf8'));
 const row=db.prepare('SELECT * FROM events').get();assert.equal(row.event_id,'old');assert.equal(row.occurred_at,123);assert.equal(row.received_at,123);
 db.exec("INSERT INTO events(event_id,visitor_id,occurred_at,event,hostname) VALUES('legacy-client','visitor',456,'pageview','noratavern.com')");assert.ok(db.prepare("SELECT received_at FROM events WHERE event_id='legacy-client'").get().received_at>0);
 assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='index' AND name IN ('events_time','events_event_time')").get().n,2);
});

test('dashboard has four core metrics, deduped platforms and separate diagnostics without legacy results',async()=>{
 const {env,sql}=setup();const visitor=crypto.randomUUID();
 const send=overrides=>post(env,event({visitor_id:visitor,...overrides}));
 await send({});await send({});
 for(const platform of ['windows','windows','mac-arm64'])await send({event:'download_click',action:platform,platform,result:'click'});
 for(const platform of ['windows','mac-arm64'])await send({event:'download_ready',action:platform,platform,result:'ready'});
 await send({event:'download_failed',action:'windows',platform:'windows',result:'timeout'});
 await send({event:'installer_resolve',action:'installers',result:'previous_complete'});
 sql.exec('UPDATE events SET occurred_at=1789488000000');
 const data=await(await get(env,'&view=dashboard')).json();
 assert.deepEqual(data.summary,{pv:2,uv:1,download_click_visitors:1,download_ready_visitors:1});
 assert.deepEqual(data.platforms[0],{platform:'windows',download_click_visitors:1,download_ready_visitors:1});
 assert.equal(data.diagnostics.raw_download_clicks,3);assert.equal(data.diagnostics.failed_requests,1);assert.equal(data.diagnostics.failures[0].reason,'timeout');
 assert.equal(data.events,undefined);assert.equal(data.unavailable,undefined);assert.equal(data.daily.length,30);
 assert.equal((await get(env,'&view=unknown')).status,400);
 const old=await(await get(env)).json();assert.equal(old.summary.download_clicks,3);assert.ok(old.events.some(e=>e.event==='installer_resolve'));
});

test('scoped entries persist idempotently and queries never reuse legacy mixed clicks',async()=>{
 const {env,sql}=setup(),visitor=crypto.randomUUID();
 for(const action of ['clawchat-local','clawchat-cloud','cloud-add','clawchat']){
  const e=event({visitor_id:visitor,event:'link_click',action});
  assert.equal((await post(env,e)).status,202);await post(env,e);await post(env,{...e,event_id:crypto.randomUUID()});
 }
 sql.exec("UPDATE events SET occurred_at="+Date.parse('2026-10-10T12:00:00+08:00'));
 const query=view=>worker.fetch(new Request(origin+'/api/stats?from=2026-10-10&to=2026-10-11'+view,{headers:{Authorization:'Bearer test-only-read-key'}}),env);
 const d=await(await query('')).json();assert.equal(d.summary.download_clicks,0);
 assert.deepEqual(d.deployment_clicks.cloud.add,{clicks:2,visitors:1});
 assert.deepEqual(d.deployment_clicks.cloud.clawchat,{clicks:2,visitors:1});
 assert.deepEqual(d.deployment_clicks.local.clawchat,{clicks:2,visitors:1});
 assert.deepEqual((await(await query('&view=dashboard')).json()).deployment_clicks,d.deployment_clicks);
 assert.equal(sql.prepare('SELECT count(*) n FROM events').get().n,8);
 assert.equal((await post(env,event({event:'link_click',action:'cloud-add',result:'created'}))).status,400);
});

test('netdisk retries deduplicate, unique visitors union across days, and installer totals stay separate',async()=>{
 const {env,sql}=setup(),one=crypto.randomUUID(),two=crypto.randomUUID();
 const a=event({visitor_id:one,event:'link_click',action:'netdisk-quark'});
 assert.equal((await post(env,a)).status,202);await post(env,a);
 await post(env,{...a,event_id:crypto.randomUUID()});
 await post(env,{...a,event_id:crypto.randomUUID(),visitor_id:two});
 sql.exec("UPDATE events SET occurred_at="+Date.parse('2026-10-19T12:00:00+08:00'));
 sql.prepare('UPDATE events SET occurred_at=? WHERE event_id=?').run(Date.parse('2026-10-20T01:00:00+08:00'),a.event_id);
 const url=origin+'/api/stats?from=2026-10-19&to=2026-10-20';
 const read=async suffix=>(await worker.fetch(new Request(url+suffix,{headers:{Authorization:'Bearer test-only-read-key'}}),env)).json();
 const d=await read('');assert.equal(d.netdisk_download.clicks,3);assert.equal(d.netdisk_download.visitors,2);
 assert.equal(d.summary.download_clicks,0);assert.equal(d.summary.download_visitors,0);assert.equal(d.summary.download_ready_requests,0);
 assert.ok(d.daily.every(row=>row.download_clicks===0&&row.download_visitors===0));
 const dash=await read('&view=dashboard');assert.deepEqual(dash.netdisk_download,d.netdisk_download);
 assert.ok(dash.platforms.every(row=>row.download_click_visitors===0));
 const filtered=await read('&channel=not-a-channel');assert.equal(filtered.netdisk_download.clicks,0);
 const old=await worker.fetch(new Request(origin+'/api/stats?from=2026-10-01&to=2026-10-18',{headers:{Authorization:'Bearer test-only-read-key'}}),env);
 assert.equal((await old.json()).netdisk_download.clicks,null);
 assert.equal((await post(env,event({event:'link_click',action:'netdisk-quark',result:'downloaded'}))).status,400);
});
