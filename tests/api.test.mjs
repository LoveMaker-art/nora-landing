import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
const origin='https://noratavern.com';
function setup(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_events.sql',import.meta.url),'utf8'));
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
