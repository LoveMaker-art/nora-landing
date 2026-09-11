(() => {
const ua = navigator.userAgent || '';
const platform = /Android/i.test(ua) ? 'Android 版' : /iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1) ? 'iPhone / iPad 版' : /Mac/i.test(ua) ? 'macOS 版' : /Windows/i.test(ua) ? 'Windows 版' : '';
if (platform) document.querySelector('#nr-download').firstChild.textContent = '下载 ' + platform + ' ';
const config = window.NoraLandingConfig || {};
if (!String(config.language || document.documentElement.lang || 'zh').toLowerCase().startsWith('zh')) document.querySelector('[data-ios]').href = 'https://apps.apple.com/us/app/id6775673749';
document.querySelector('[data-copy]').addEventListener('click', async () => {
const node = document.querySelector('[data-agent-code]');
const status = document.querySelector('#copy-status');
try { await navigator.clipboard.writeText(node.textContent.trim()); status.textContent = '添加码已复制。'; }
catch { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); status.textContent = '请长按或使用系统复制操作，复制已选中的添加码。'; }
});
function revealCost() { if (location.hash === '#cost') document.getElementById('cost').open = true; }
document.querySelectorAll('a[href="#cost"]').forEach(a => a.addEventListener('click', () => { document.getElementById('cost').open = true; }));
window.addEventListener('hashchange', revealCost); revealCost();
})();