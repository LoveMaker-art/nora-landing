/* Load the owner's Umami tracking script in <head> to enable collection.
   No tracker/account configured: no requests and no effect on navigation. */
(() => {
  'use strict';
  const root = document.getElementById('nora-original-matched');
  if (!root || root.dataset.analyticsInitialized) return;
  root.dataset.analyticsInitialized = 'true';
  const events = [
    ['.launcher-link', 'local_launcher_click'],
    ['.source-link, footer a[href="https://github.com/LoveMaker-art/noras-tavern"]', 'source_code_click'],
    ['#nr-download', 'clawchat_download_click'],
    ['#nr-add', 'cloud_agent_add_click'],
    ['.downloads a, #nr-download-status a', 'clawchat_manual_download_click'],
    ['.install-help a, #nr-add-status a', 'agent_share_page_click']
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
