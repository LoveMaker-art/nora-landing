import {mkdir,rm,copyFile,cp} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const f of ['index.html','landing.css','analytics.js','installers.js'])await copyFile(f,`dist/${f}`);
await cp('assets','dist/assets',{recursive:true});
