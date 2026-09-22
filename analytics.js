/* Load the owner's Umami tracking script in <head> to enable collection.
   No tracker/account configured: no requests and no effect on navigation. */
(() => {
  'use strict';
  const root = document.getElementById('nora-original-matched');
  if (!root || root.dataset.analyticsInitialized) return;
  root.dataset.analyticsInitialized = 'true';
  const events = [
    ['[data-installer][data-download-fallback="true"]', '前往 GitHub 选择安装包'],
    ['[data-installer="windows"]', '下载本地启动器 Windows'],
    ['[data-installer="mac-arm64"]', '下载本地启动器 Mac Apple 芯片'],
    ['[data-installer="mac-x64"]', '下载本地启动器 Mac Intel'],
    ['[data-local-im]', '本地部署下载 ClawChat'],
    ['[data-pairing]', '查看本地配对指引'],
    ['.source-link, footer a[href="https://github.com/LoveMaker-art/noras-tavern"]', '查看开源代码'],
    ['#nr-download', '下载 ClawChat'],
    ['#nr-add', '添加云端诺拉'],
    ['.downloads a, #nr-download-status a', '其他平台下载'],
    ['.install-help a, #nr-add-status a', '打开诺拉分享页']
  ];
  // Capture precedes existing same-tab and app-protocol navigation handlers.
  // Never await analytics, cancel the click or infer successful installation.
  root.addEventListener('click', event => {
    if (!window.umami || typeof window.umami.track !== 'function') return;
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    for (const [selector, name] of events) {
      const element = target.closest(selector);
      if (!element || !root.contains(element)) continue;
      try {
        const result = window.umami.track(name);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (_) { /* Analytics must never prevent download or app launch. */ }
      break;
    }
  }, true);
})();
