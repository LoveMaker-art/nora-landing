/* Cloud actions are independent of local installer downloads. */
(() => {
  'use strict';
  const card = document.querySelector('.cloud-deploy');
  if (!card) return;
  const code = card.dataset.agentCode;
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(ua) && navigator.maxTouchPoints > 1);
  const platform = /Android/i.test(ua) ? 'android' : ios ? 'ios' : /Mac/i.test(ua) ? 'macos' : /Windows/i.test(ua) ? 'windows' : 'unknown';
  const downloads = {
    android: 'https://plugin.clawling.chat/android/clawchat-latest.apk',
    ios: 'https://apps.apple.com/cn/app/id6775673749',
    macos: 'https://plugin.clawling.chat/macos/clawchat-latest.dmg',
    windows: 'https://plugin.clawling.chat/windows/clawchat-latest-setup.exe',
    unknown: 'https://clawling.com/zh/chat/#get'
  };
  card.querySelector('#device-hint').textContent = {
    android: '当前设备：Android', ios: '当前设备：iPhone / iPad',
    macos: '当前设备：Mac', windows: '当前设备：Windows', unknown: '请选择你的设备'
  }[platform];
  card.querySelector('#nr-download').addEventListener('click', () => {
    const status = card.querySelector('#nr-download-status');
    status.textContent = '安装并登录后，请返回本页添加诺拉。其他平台可在下方帮助中选择。';
    status.hidden = false;
    window.location.href = downloads[platform];
  });
  // No stale default: an unconfirmed entry cannot launch the old agent.
  if (!/^[a-z0-9]{4}-[a-z0-9]{8}-[a-z0-9]{8}$/i.test(code || '')) return;
  const share = 'https://clawling.com/zh/nest/share/' + encodeURIComponent(code);
  const shareLink = card.querySelector('[data-cloud-share]');
  shareLink.href = share;
  shareLink.hidden = false;
  card.querySelector('[data-agent-code]').textContent = code;
  card.querySelector('.code-box').hidden = false;
  const add = card.querySelector('#nr-add');
  add.disabled = false;
  card.querySelector('.cloud-return-note').textContent = '首次使用：下载并登录，再回来添加。';
  add.addEventListener('click', () => {
    const status = card.querySelector('#nr-add-status');
    status.replaceChildren(document.createTextNode('未打开 ClawChat？请先安装，或 '));
    const link = document.createElement('a');
    link.href = share;
    link.textContent = '打开诺拉分享页 ↗';
    link.target = '_blank';
    link.rel = 'noopener';
    status.appendChild(link);
    status.hidden = false;
    // Navigate within the click gesture; visibility changes do not prove creation.
    window.location.href = 'clawchat://shared-agent?code=' + encodeURIComponent(code);
  });
  const copy = card.querySelector('[data-copy]');
  copy.disabled = false;
  copy.addEventListener('click', async () => {
    const status = card.querySelector('#copy-status');
    try { await navigator.clipboard.writeText(code); status.textContent = '添加码已复制。'; }
    catch { status.textContent = '请选中上方添加码，手动复制。'; }
  });
})();
