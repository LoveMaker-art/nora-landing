(() => {
  'use strict';
  const repo = 'LoveMaker-art/noras-tavern';
  const base = `https://github.com/${repo}/releases/`;
  const patterns = {
    windows: /^Nora-Tavern-Launcher-([\d.]+)-win-x64-setup\.exe$/,
    'mac-arm64': /^Nora-Tavern-Launcher-([\d.]+)-mac-arm64\.dmg$/,
    'mac-x64': /^Nora-Tavern-Launcher-([\d.]+)-mac-x64\.dmg$/
  };
  function select(release) {
    if (!release || release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) return null;
    const found = {};
    for (const [platform, pattern] of Object.entries(patterns)) {
      const asset = (release.assets || []).find(a => pattern.test(a.name) && a.state === 'uploaded' && a.size > 0);
      if (!asset || asset.browser_download_url !== `${base}download/${release.tag_name}/${asset.name}`) return null;
      found[platform] = { url: asset.browser_download_url, version: asset.name.match(pattern)[1] };
    }
    if (new Set(Object.values(found).map(a => a.version)).size !== 1) return null;
    return { tag: release.tag_name, version: found.windows.version, assets: found };
  }
  const status = document.getElementById('installer-status');
  if (!status) return;
  status.textContent = '正在获取最新安装包…';
  document.querySelectorAll('[data-installer]').forEach(link => { link.dataset.downloadFallback = 'true'; });
  async function request(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`GitHub ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function resolve() {
    const latest = await request('releases/latest');
    let result = select(latest);
    // Component-only releases may not include installers. Search the official
    // history for the most recently published complete three-platform bundle.
    if (!result) {
      const releases = await request('releases?per_page=100');
      result = releases.filter(r => !r.draft && !r.prerelease)
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
        .map(select).find(Boolean);
    }
    if (!result) throw new Error('No complete installer release found');
    for (const [platform, asset] of Object.entries(result.assets)) {
      const link = document.querySelector(`[data-installer="${platform}"]`);
      link.href = asset.url;
      delete link.dataset.downloadFallback;
    }
    document.getElementById('installer-release').href = `${base}tag/${result.tag}`;
    status.textContent = '已获取最新完整安装包，选择系统即可下载。' +
      (result.tag !== latest.tag_name ? '安装后请在启动器检查组件更新。' : '');
  }
  resolve().catch(() => {
    // Never fall back to a pinned old installer.
    status.textContent = '暂时无法获取安装包。三个下载入口将前往 GitHub 发布页，请在那里选择安装包。';
    document.querySelectorAll('[data-installer]').forEach(link => {
      link.href = `${base}latest`;
      link.dataset.downloadFallback = 'true';
      link.setAttribute('aria-label', `${link.textContent.trim()}：前往 GitHub 选择安装包`);
    });
    document.getElementById('installer-release').href = `${base}latest`;
  });
})();
