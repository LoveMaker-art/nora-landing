import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import skills from '../skills/catalogue.js';

const historical = [
 ['nora-persona-designer','0.1.2',8579,'48b267b32a12ff4b5204f6e3e13c38da524d03471a9e54595dd62bf5959b3f07'],
 ['sillytavern-control','0.1.0',13405,'db682715ed0520f8d68e0df6c2ca0d1c8bfbcad8b67494dd8303447a8e9c6cd3']
];

test('current packages match the catalogue and local static build; historical packages remain unchanged',async()=>{
 for(const [id,version] of [['nora-persona-designer','0.1.3'],['sillytavern-control','0.2.1']]){
  const item=skills.find(s=>s.id===id);assert.ok(item);
  assert.equal(item.delivery,'download');assert.equal(item.version,version);
  assert.equal(item.package,`packages/${id}-${version}.zip`);
  for(const prefix of ['skills','dist/skills']){
   const data=await readFile(path.join(prefix,item.package));
   assert.equal(data.length,item.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);
  }
  assert.ok(!item.sourceURL.startsWith('https://github.com/'),'standalone sources must resolve to the hosted skill docs');
  await access(path.join('dist/skills',item.sourceURL));
  const guide=await readFile(path.join('skills',item.sourceURL),'utf8');
  assert.match(guide,new RegExp(`^version: ${version.replaceAll('.','\\.')}\\r?$`,'m'));
  assert.equal(await readFile(path.join('dist/skills',item.sourceURL),'utf8'),guide);
 }
 for(const [id,version,bytes,hash] of historical){
  const data=await readFile(`skills/packages/${id}-${version}.zip`);
  assert.equal(data.length,bytes);assert.equal(createHash('sha256').update(data).digest('hex'),hash);
 }
});

test('the existing five project skills remain, and supported environments stay explicit',()=>{
 assert.deepEqual(skills.filter(s=>s.delivery==='bundled').map(s=>s.id).sort(),['nora-cardforge','tavern','tavern-ops','tavern-updater','model-provider-config'].sort());
 assert.equal(new Set(skills.map(s=>s.id)).size,7);
 assert.match(skills.find(s=>s.id==='nora-persona-designer').requirement,/不会自动更换你现在的人格/);
 assert.match(skills.find(s=>s.id==='sillytavern-control').requirement,/不包含 st-mcp/);
 assert.match(skills.find(s=>s.id==='sillytavern-control').requirement,/尚未实测/);
});

test('homepage entries and all secondary-page assets resolve inside production dist',async()=>{
 const home=await readFile('dist/index.html','utf8');
 assert.equal((home.match(/href="skills\/"/g)||[]).length,2);
 assert.equal((home.match(/data-installer=/g)||[]).length,3);
 const html=await readFile('dist/skills/index.html','utf8');
 assert.ok(!html.includes('skills-prototype'));assert.ok(!html.includes('noindex'));assert.ok(!html.includes('设计预览'));
 assert.ok(!html.includes('预览版'));
 const catalogue=JSON.parse(await readFile('dist/skills/catalogue.json','utf8'));
 assert.equal(catalogue.release_state,'published');
 assert.equal(catalogue.skills.length,7);
 await assert.rejects(access('dist/skills/catalogue.local.json'));
 await assert.rejects(access('dist/skills/LOCAL-TEST.md'));
 assert.match(html,/<script type="module" src="library.js(?:\?[^"]*)?">/);
 for(const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(/^(?:https?:|#)/.test(url))continue;
  const target=path.resolve('dist/skills',url.split('#')[0].split('?')[0]);
  assert.ok(target.startsWith(path.resolve('dist')+path.sep));await stat(target);
 }
 const js=await readFile('dist/skills/library.js','utf8');
 await access('dist/skills/catalogue.js');
 for(const [,id] of js.matchAll(/getElementById\('([^']+)'\)/g))assert.ok(html.includes(`id="${id}"`),`Missing UI target ${id}`);
});

test('manager package and website expose only browsing and installation',async()=>{
 const html=await readFile('dist/skills/index.html','utf8');
 const js=await readFile('dist/skills/library.js','utf8');
 assert.ok(!/submission|receipt|review\//.test(html));
 assert.ok(!js.includes('/api/skills/web'));
 const manager=(await import('../skills/manager.js')).default;
 assert.equal(manager.version,'0.3.0');
 const data=await readFile('skills/'+manager.package);
 assert.equal(createHash('sha256').update(data).digest('hex'),manager.sha256);
 assert.equal(data.length,manager.bytes);
 await assert.rejects(access('dist/skills/packages/nora-skill-library-0.2.0.zip'));
 await assert.rejects(access('dist/skills/submissions.js'));
 const source=await readFile('dist/skills/guides/nora-skill-library/scripts/library.py','utf8');
 assert.ok(!/submission|receipt|add_parser\('submit'/.test(source));
 const sources=await readFile('dist/skills/guides/nora-skill-library/references/sources.json','utf8');
 assert.ok(!sources.includes('submissionApi'));
});
