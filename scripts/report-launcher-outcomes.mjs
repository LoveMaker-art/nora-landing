import {pathToFileURL} from 'node:url';

export function formatOutcomeReport(data){
 const o=data?.outcomes,keys=['affected_installations','later_succeeded_installations','latest_failed_installations',
  'in_progress_installations','unconfirmed_installations'];
 if(!o||!keys.every(k=>Number.isSafeInteger(o[k])&&o[k]>=0)||
  keys.slice(1).reduce((n,k)=>n+o[k],0)!==o.affected_installations)throw Error('Outcome summary unavailable; do not substitute failed-operation totals.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(data.from)||!/^\d{4}-\d{2}-\d{2}$/.test(data.to))throw Error('Invalid report range.');
 return [`启动器问题汇总：${data.from} 至 ${data.to}（北京时间）`,
  `遇到问题的安装环境：${o.affected_installations}`,
  `后续同类操作成功：${o.later_succeeded_installations}`,
  `最近同类操作结果失败：${o.latest_failed_installations}`,
  `仍在处理：${o.in_progress_installations}`,
  `结果尚未确认：${o.unconfirmed_installations}`,
  '按安装环境去重；后续成功不代表根因修复，未收到结果不代表仍在失败。'].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [from,to=from]=process.argv.slice(2),key=process.env.STATS_READ_KEY;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||!key)throw Error('Provide from/to dates and STATS_READ_KEY through the environment.');
  const url=new URL('https://noratavern.com/api/launcher/stats');url.search=new URLSearchParams({from,to,view:'problems'});
  const response=await fetch(url,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Statistics request failed: HTTP '+response.status);
  const data=await response.json();
  if(data.from!==from||data.to!==to||data.timezone!=='Asia/Shanghai'||data.scope)throw Error('Statistics scope mismatch.');
  if(data.stale)console.log('注意：以下为上次成功取得的汇总，暂未更新。');
  console.log(formatOutcomeReport(data));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
