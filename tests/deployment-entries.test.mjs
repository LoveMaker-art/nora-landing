import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentClicks} from '../server/deployment-clicks.mjs';

const rows=[
 {event:'link_click',action:'clawchat',count:30,visitors:20},
 {event:'link_click',action:'clawchat-local',count:3,visitors:2},
 {event:'link_click',action:'clawchat-cloud',count:5,visitors:4},
 {event:'link_click',action:'cloud-add',count:7,visitors:6}
];
test('deployment entries exclude legacy mixed clicks and retain distinct counts',()=>{
 const d=deploymentClicks(rows,'2026-10-10','2026-10-11');
 assert.equal(d.status,'ok');assert.equal(d.agent_code,'fb24-84e01bec-1eb1b680');
 assert.deepEqual(d.local.clawchat,{clicks:3,visitors:2});
 assert.deepEqual(d.cloud.clawchat,{clicks:5,visitors:4});
 assert.deepEqual(d.cloud.add,{clicks:7,visitors:6});
});
test('before rollout is unknown, rollout day is partial, true later zeros stay zero',()=>{
 const old=deploymentClicks(rows,'2026-10-01','2026-10-08');
 assert.equal(old.status,'not_collected');assert.equal(old.cloud.add.visitors,null);
 const mixed=deploymentClicks(rows,'2026-10-01','2026-10-10');
 assert.equal(mixed.status,'partial');assert.equal(mixed.from,'2026-10-09');assert.equal(mixed.cloud.add.visitors,6);
 assert.equal(deploymentClicks(rows,'2026-10-09','2026-10-09').status,'partial');
 assert.equal(deploymentClicks([],'2026-10-10','2026-10-11').cloud.add.visitors,0);
});
