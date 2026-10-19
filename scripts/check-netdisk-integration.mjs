import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import worker from '../server/worker.mjs';
const dashboard=process.argv[2];if(!dashboard)throw Error('Provide dashboard source directory');
const {landingStats}=await import(pathToFileURL(resolve(dashboard,'landing-stats.mjs')));
const sql=new DatabaseSync(':memory:');
for(const file of ['0001_events.sql','0004_website_outcomes.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
const statement=(text,args=[])=>({bind(...values){return statement(text,values);},async run(){return sql.prepare(text).run(...args);},async all(){return {results:sql.prepare(text).all(...args)};}});
const env={DB:{prepare:statement,batch:items=>Promise.all(items.map(s=>s.all()))},VISITOR_HASH_SECRET:'integration-only-hash',STATS_READ_KEY:'integration-only-read'};
const makeBrowser=()=>{
 const store=new Map(),handlers={};let click;
 class Element{constructor(){this.dataset={entryAction:'netdisk-quark'};}closest(selector){return selector==='[data-entry-action]'?this:null;}}
 const root={dataset:{},addEventListener(name,fn){if(name==='click')click=fn;},querySelectorAll:()=>[]};
 const context={document:{getElementById:()=>root,referrer:''},window:{addEventListener:(n,f)=>handlers[n]=f},location:{hostname:'noratavern.com',href:'https://noratavern.com/'},navigator:{userAgent:'desktop'},Element,crypto,URL,AbortSignal,
  localStorage:{get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},setTimeout:()=>0,
  fetch:async(input,options)=>{const req=new Request(input,{...options,headers:{...options.headers,Origin:'https://noratavern.com'}});const r=await worker.fetch(req,env);assert.equal(r.status,202);return r;}};
 vm.runInNewContext(readFileSync(new URL('../analytics.js',import.meta.url),'utf8'),context);
 return ()=>click({target:new Element(),preventDefault(){throw Error('click blocked navigation');}});
};
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
try{
 const first=makeBrowser(),second=makeBrowser();await settle();first();await settle();first();await settle();second();await settle();
 const day=new Date(Date.now()+28800000).toISOString().slice(0,10),url=new URL('https://dashboard.example/api/landing-stats?from='+day+'&to='+day);
 const reply=await landingStats(url,'integration-only-read',(input,options)=>worker.fetch(new Request(input,options),env));assert.equal(reply.status,200);const d=await reply.json();
 assert.equal(d.netdisk_download.clicks,3);assert.equal(d.netdisk_download.visitors,2);assert.equal(d.summary.download_clicks,0);assert.equal(d.summary.download_visitors,0);assert.ok(d.platforms.every(r=>r.visitors===0));
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM events WHERE action='netdisk-quark'").get().n,3);
 console.log(JSON.stringify({real_frontend_to_receiver_to_dashboard_adapter:d.netdisk_download,original_download_clicks:d.summary.download_clicks,original_download_visitors:d.summary.download_visitors,production_writes:false}));
}finally{sql.close();}
