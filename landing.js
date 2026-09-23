(function () {
  'use strict';
  const root = document.getElementById('nora-original-matched');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const config = window.NoraLandingConfig || {};
  const code = config.agentCode || 'fb24-84e01bec-1eb1b680';
  const shareUrl = 'https://clawling.com/zh/nest/share/' + encodeURIComponent(code);
  const ua = navigator.userAgent || '';
  const platform = /Android/i.test(ua) ? 'android'
    : /iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1) ? 'ios'
    : /Mac/i.test(ua) ? 'macos' : /Windows/i.test(ua) ? 'windows' : 'unknown';
  const downloads = {
    apk: 'https://plugin.clawling.chat/android/clawchat-latest.apk',
    play: 'https://play.google.com/store/apps/details?id=com.clawling.clawchat.app',
    iosCN: 'https://apps.apple.com/cn/app/id6775673749',
    iosUS: 'https://apps.apple.com/us/app/id6775673749',
    macos: 'https://plugin.clawling.chat/macos/clawchat-latest.dmg',
    windows: 'https://plugin.clawling.chat/windows/clawchat-latest-setup.exe'
  };
  const emit = (name, detail = {}) => { try { config.onEvent?.(name, detail); } catch (_) {} };
  root.querySelectorAll('[data-agent-code]').forEach(node => { node.textContent = code; });
  root.querySelectorAll('[data-jump]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.jump);
      if (target && root.contains(target)) target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  });
  const iosUrl = () => String(config.language || document.documentElement.lang || 'zh').toLowerCase().split('-')[0] === 'zh' ? downloads.iosCN : downloads.iosUS;
  function downloadUrl() {
    // Domestic audience: Android defaults to APK, with Google Play as a manual alternative.
    if (platform === 'android') return downloads.apk;
    if (platform === 'ios') return iosUrl();
    return downloads[platform];
  }
  function showHelp(id, message, links) {
    const status = root.querySelector('#' + id);
    status.replaceChildren(document.createTextNode(message));
    for (const [label, href] of links) {
      const link = document.createElement('a');
      link.textContent = label;
      link.href = href;
      link.style.cssText = 'display:inline-block;margin:6px 12px 0 0;text-decoration:underline';
      status.appendChild(link);
    }
    status.hidden = false;
  }
  root.querySelector('#nr-download').addEventListener('click', () => {
    const url = downloadUrl();
    showHelp('nr-download-status', '下载未开始？可手动选择；安装后请回到本页添加诺拉。', [
      ['安卓 APK', downloads.apk], ['Google Play', downloads.play],
      ['iPhone / iPad', iosUrl()], ['macOS', downloads.macos], ['Windows', downloads.windows]
    ]);
    try { if (url) window.location.href = url; } catch (_) {}
    emit('download_click', { platform, target: url || null });
  });
  root.querySelector('#nr-add').addEventListener('click', () => {
    const target = platform === 'android'
      ? 'intent://shared-agent?code=' + encodeURIComponent(code) + '#Intent;scheme=clawchat;package=' + encodeURIComponent(config.androidPackage || 'com.clawling.clawchat') + ';S.browser_fallback_url=' + encodeURIComponent(shareUrl) + ';end'
      : 'clawchat://shared-agent?code=' + encodeURIComponent(code);
    showHelp('nr-add-status', '若未打开，请先安装 ClawChat，或用系统浏览器重试。也可以打开原分享页继续。', [['打开原分享页', shareUrl]]);
    // Synchronous click-stack navigation: no await, timer, or region lookup.
    // Never infer installation or creation success from blur/visibility/clicks.
    try { window.location.href = target; } catch (_) {}
    emit('open_agent_click', { platform, agentCode: code });
  });
})();
