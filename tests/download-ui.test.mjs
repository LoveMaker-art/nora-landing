import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function element(extra={}) {return {hidden:false,disabled:false,textContent:'',dataset:{},classList:{add(){}},attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},addEventListener(k,fn){this.listeners[k]=fn;},...extra};}
function harness(fetcher){
 const status=element(),frame=element(),requests=[];
 const links=['windows','mac-arm64','mac-x64'].map(p=>element({detail:element({textContent:'安装包格式'}),querySelector(){return this.detail;},lastElementChild:element(),dataset:{installer:p},href:`https://noratavern.com/api/download/${p}`}));
 const timers=[],events=[];
 const context={crypto,CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail;}},window:{dispatchEvent(e){events.push(e.detail);}},document:{getElementById:()=>status,querySelectorAll:()=>links,createElement:()=>frame,body:{append(){}}},URL,AbortSignal,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},fetch:async u=>{requests.push(u);return fetcher(u);}};
 vm.runInNewContext(readFileSync('installers.js','utf8'),context);
 return {status,frame,links,requests,timers,events,click(p='windows'){let prevented=false;links.find(l=>l.dataset.installer===p).listeners.click({preventDefault(){prevented=true;}});assert.ok(prevented);}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const file='https://github.com/LoveMaker-art/noras-tavern/releases/download/v2.3.15/Nora-Tavern-Launcher-1.1.2-win-x64-setup.exe';
test('normal download restores original card with no extra retry CTA; another click rechecks',async()=>{
 const h=harness(async()=>Response.json({url:file}));h.click();assert.equal(h.links[0].attributes['aria-busy'],'true');await settle();
 assert.equal(h.frame.src,file);assert.match(h.status.textContent,/已发起下载|已发起 Windows 下载/);
 assert.equal(h.links[0].detail.textContent,'安装包格式');assert.equal(h.links[0].attributes['aria-busy'],undefined);
 h.click();await settle();assert.ok(h.requests[1].includes('retry=1'));assert.ok(h.requests.every(u=>!u.includes('api.github.com')));
});
test('cooldown stays on failed platform; other platforms remain enabled',async()=>{
 const h=harness(async()=>Response.json({error:'check_cooldown',retryAfter:2},{status:429}));h.click();await settle();
 assert.equal(h.frame.src,undefined);assert.match(h.status.textContent,/2 秒后/);
 assert.equal(h.links[0].attributes['aria-disabled'],'true');assert.equal(h.links[1].attributes['aria-disabled'],undefined);
 h.click();assert.equal(h.requests.length,1);
 h.timers.shift()();assert.match(h.status.textContent,/1 秒后/);h.timers.shift()();
 assert.equal(h.links[0].detail.textContent,'安装包格式');assert.equal(h.links[0].attributes['aria-disabled'],undefined);
});
test('failed card retries in place and recovers original appearance after success',async()=>{
 let fail=true;const h=harness(async()=>{if(fail)throw Error('network');return Response.json({url:file});});
 h.click();await settle();assert.equal(h.links[0].detail.textContent,'安装包格式');assert.match(h.status.textContent,/暂时无法开始/);assert.equal(h.frame.src,undefined);
 fail=false;h.click();await settle();assert.equal(h.links[0].detail.textContent,'安装包格式');assert.match(h.status.textContent,/已发起/);assert.ok(h.requests[1].includes('retry=1'));
});
test('invalid file result never navigates to a release page',async()=>{
 const h=harness(async()=>Response.json({url:'https://github.com/LoveMaker-art/noras-tavern/releases/tag/v2.3.17'}));h.click();await settle();assert.match(h.status.textContent,/暂时无法/);assert.equal(h.frame.src,undefined);
});

test('only actual requests produce one outcome; busy and cooldown clicks produce none',async()=>{
 let finish;const h=harness(()=>new Promise(r=>{finish=r;}));h.click();h.click();assert.equal(h.requests.length,1);
 finish(Response.json({url:file}));await settle();assert.equal(h.events.length,1);assert.equal(h.events[0].event,'download_ready');
 const fail=harness(async()=>Response.json({error:'check_cooldown',retryAfter:2},{status:429}));fail.click();await settle();fail.click();
 assert.equal(fail.events.length,1);assert.equal(fail.events[0].event,'download_failed');assert.equal(fail.events[0].result,'rate_limited');
});
test('a verified SourceForge installer uses the original download card and feedback',async()=>{
 const target=file.replace('https://github.com/LoveMaker-art/noras-tavern/releases/download/','https://downloads.sourceforge.net/project/nora-tavern/');
 const h=harness(async()=>Response.json({url:target}));h.click();await settle();
 assert.equal(h.frame.src,target);assert.equal(h.events[0].event,'download_ready');
 assert.equal(h.links[0].detail.textContent,'安装包格式');
});
test('untrusted SourceForge projects, platform mismatches and signed links cannot navigate',async()=>{
 const target=file.replace('https://github.com/LoveMaker-art/noras-tavern/releases/download/','https://downloads.sourceforge.net/project/nora-tavern/');
 for(const url of [target.replace('nora-tavern/','other/'),target+'?token=secret',target.replace('-win-x64-setup.exe','-mac-arm64.dmg'),target.replace('1.1.2-','1.1.2-malformed-')]) {
  const h=harness(async()=>Response.json({url}));h.click();await settle();assert.equal(h.frame.src,undefined);assert.equal(h.events[0].event,'download_failed');
 }
});
