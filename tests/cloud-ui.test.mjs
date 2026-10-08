import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync('cloud.js', 'utf8');
function harness(code, userAgent = 'Windows') {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      disabled: true, hidden: true, textContent: '', listeners: {},
      addEventListener(event, fn) { this.listeners[event] = fn; },
      replaceChildren() {}, appendChild(child) { this.child = child; }
    });
    return nodes.get(selector);
  };
  const location = {};
  vm.runInNewContext(source, {
    document: {
      querySelector: () => ({dataset: {agentCode: code}, querySelector: node}),
      createTextNode: text => text, createElement: () => ({})
    },
    navigator: {userAgent, maxTouchPoints: 0, clipboard: {writeText: async () => {}}},
    window: {location}, encodeURIComponent
  });
  return {node, location};
}

test('unconfirmed cloud entry cannot open a stale agent; ClawChat download still works', () => {
  const h = harness('');
  assert.equal(h.node('#nr-add').disabled, true);
  assert.equal(h.node('#nr-add').listeners.click, undefined);
  h.node('#nr-download').listeners.click();
  assert.equal(h.location.href, 'https://plugin.clawling.chat/windows/clawchat-latest-setup.exe');
});

test('app action, web fallback and copy use the same confirmed code', async () => {
  const code = 'test-12345678-abcdefgh';
  const h = harness(code);
  assert.equal(h.node('#nr-add').disabled, false);
  h.node('#nr-add').listeners.click();
  assert.equal(h.location.href, 'clawchat://shared-agent?code=' + code);
  assert.equal(h.node('#nr-add-status').child.href, 'https://clawling.com/zh/nest/share/' + code);
  assert.equal(h.node('[data-cloud-share]').href, h.node('#nr-add-status').child.href);
  assert.equal(h.node('[data-agent-code]').textContent, code);
  await h.node('[data-copy]').listeners.click();
  assert.equal(h.node('#copy-status').textContent, '添加码已复制。');
});

test('unknown devices go to the official download page rather than a guessed package', () => {
  const h = harness('', 'Linux');
  h.node('#nr-download').listeners.click();
  assert.equal(h.location.href, 'https://clawling.com/zh/chat/#get');
});
