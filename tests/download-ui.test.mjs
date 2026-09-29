import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function element(extra={}) {return {hidden:false,disabled:false,textContent:'',attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},addEventListener(k,fn){this.listeners[k]=fn;},...extra};}
function harness(fetcher){
 const status=element(),retry=element({hidden:true}),frame=element(),requests=[];
 const links=['windows','mac-arm64','mac-x64'].map(p=>element({dataset:{installer:p},href:`https://noratavern.com/api/download/${p}`}));
 const timers=[];
 const context={document:{getElementById:id=>id==='installer-status'?status:retry,querySelectorAll:()=>links,createElement:()=>frame,body:{append(){}}},URL,AbortSignal,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},fetch:async u=>{requests.push(u);return fetcher(u);}};
 vm.runInNewContext(readFileSync('installers.js','utf8'),context);
 return {status,retry,frame,links,requests,timers,click(p='windows'){let prevented=false;links.find(l=>l.dataset.installer===p).listeners.click({preventDefault(){prevented=true;}});assert.ok(prevented);}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const file='https://github.com/LoveMaker-art/noras-tavern/releases/download/v2.3.15/Nora-Tavern-Launcher-1.1.2-win-x64-setup.exe';
test('immediate click prepares server download, retains page and retry rechecks',async()=>{
 const h=harness(async()=>Response.json({url:file}));h.click();assert.match(h.status.textContent,/正在准备/);await settle();
 assert.equal(h.frame.src,file);assert.match(h.status.textContent,/已发起下载/);assert.equal(h.retry.hidden,false);assert.equal(h.retry.textContent,'重新下载');
 h.retry.listeners.click();await settle();assert.ok(h.requests[1].includes('retry=1'));assert.ok(h.requests.every(u=>!u.includes('api.github.com')));
});
test('failure restores usable controls, honors retry delay, never launches release page',async()=>{
 const h=harness(async()=>Response.json({error:'check_cooldown',retryAfter:30},{status:429}));h.click();await settle();
 assert.equal(h.frame.src,undefined);assert.equal(h.retry.disabled,true);assert.equal(h.retry.textContent,'重新检查下载');
 assert.equal(h.links[0].attributes['aria-disabled'],undefined);h.timers[0]();assert.equal(h.retry.disabled,false);
});
test('network and unexpected payload errors show retry without navigating',async()=>{
 for(const fetcher of [async()=>{throw Error('network');},async()=>Response.json({url:'https://github.com/LoveMaker-art/noras-tavern/releases/tag/v2.3.17'})]){
  const h=harness(fetcher);h.click();await settle();assert.match(h.status.textContent,/暂时无法/);assert.equal(h.frame.src,undefined);assert.equal(h.retry.disabled,false);
 }
});
