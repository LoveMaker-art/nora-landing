(() => {
const ua = navigator.userAgent || '';
const platform = /Android/i.test(ua) ? 'Android 版' : /iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1) ? 'iPhone / iPad 版' : /Mac/i.test(ua) ? 'macOS 版' : /Windows/i.test(ua) ? 'Windows 版' : '';
document.querySelector('#device-hint').textContent = platform ? '当前推荐：' + platform.replace('macOS', 'Mac') : '选择你的设备';
if (!platform) document.querySelector('.cloud-help').open = true;
const config = window.NoraLandingConfig || {};
// Store regions are explicit choices; keep labels and destinations aligned.
document.querySelector('[data-copy]').addEventListener('click', async () => {
const node = document.querySelector('[data-agent-code]');
const status = document.querySelector('#copy-status');
try { await navigator.clipboard.writeText(node.textContent.trim()); status.textContent = '添加码已复制。'; }
catch { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); status.textContent = '请长按或使用系统复制操作，复制已选中的添加码。'; }
});
})();