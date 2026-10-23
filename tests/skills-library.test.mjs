import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import skills from '../skills/catalogue.js';

const shipped = [
 ['nora-persona-designer','0.1.2',8579,'48b267b32a12ff4b5204f6e3e13c38da524d03471a9e54595dd62bf5959b3f07'],
 ['sillytavern-control','0.1.0',13405,'db682715ed0520f8d68e0df6c2ca0d1c8bfbcad8b67494dd8303447a8e9c6cd3']
];

test('author-supplied packages retain their exact bytes in the production build',async()=>{
 for(const [id,version,bytes,hash] of shipped){
  const item=skills.find(s=>s.id===id);assert.ok(item);
  assert.equal(item.delivery,'download');assert.equal(item.version,version);
  for(const prefix of ['skills','dist/skills']){
   const data=await readFile(path.join(prefix,item.package));
   assert.equal(data.length,bytes);assert.equal(createHash('sha256').update(data).digest('hex'),hash);
  }
  assert.equal(item.bytes,bytes);assert.equal(item.sha256,hash);
  assert.ok(!item.sourceURL.startsWith('https://github.com/'),'standalone sources must resolve to the hosted skill docs');
  await access(path.join('dist/skills',item.sourceURL));
 }
});

test('the existing five project skills remain, and supported environments stay explicit',()=>{
 assert.deepEqual(skills.filter(s=>s.delivery==='bundled').map(s=>s.id).sort(),['nora-cardforge','tavern','tavern-ops','tavern-updater','model-provider-config'].sort());
 assert.equal(new Set(skills.map(s=>s.id)).size,7);
 assert.match(skills.find(s=>s.id==='nora-persona-designer').requirement,/不会自动覆盖活动人格/);
 assert.match(skills.find(s=>s.id==='sillytavern-control').requirement,/不包含 st-mcp/);
 assert.match(skills.find(s=>s.id==='sillytavern-control').requirement,/尚未实测/);
});

test('homepage entries and all secondary-page assets resolve inside production dist',async()=>{
 const home=await readFile('dist/index.html','utf8');
 assert.equal((home.match(/href="skills\/"/g)||[]).length,2);
 assert.equal((home.match(/data-installer=/g)||[]).length,3);
 const html=await readFile('dist/skills/index.html','utf8');
 assert.ok(!html.includes('skills-prototype'));assert.ok(!html.includes('noindex'));assert.ok(!html.includes('设计预览'));
 assert.match(html,/<script type="module" src="library.js">/);
 for(const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(/^(?:https?:|#)/.test(url))continue;
  const target=path.resolve('dist/skills',url.split('#')[0].split('?')[0]);
  assert.ok(target.startsWith(path.resolve('dist')+path.sep));await stat(target);
 }
 const js=await readFile('dist/skills/library.js','utf8');
 await access('dist/skills/catalogue.js');
 for(const [,id] of js.matchAll(/getElementById\('([^']+)'\)/g))assert.ok(html.includes(`id="${id}"`),`Missing UI target ${id}`);
});
