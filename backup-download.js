/* The netdisk link and copy action do not participate in installer downloads. */
(() => {
 'use strict';
 const button=document.getElementById('backup-copy');
 const code=document.getElementById('backup-access-code');
 if(!button||!code)return;
 let reset;
 button.addEventListener('click',async()=>{
  clearTimeout(reset);
  try {
   await navigator.clipboard.writeText(code.textContent.trim());
   button.textContent='已复制';
  }catch {
   const range=document.createRange();range.selectNodeContents(code);
   const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
   button.textContent='请手动复制';
  }
  reset=setTimeout(()=>{button.textContent='复制';},2500);
 });
})();
