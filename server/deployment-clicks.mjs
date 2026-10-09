export const deploymentCollectionStart='2026-10-09';
export const deploymentAgentCode='fb24-84e01bec-1eb1b680';
export function deploymentClicks(actions,from,to){
 const firstCompleteDay='2026-10-10';
 const status=to<deploymentCollectionStart?'not_collected':from<firstCompleteDay?'partial':'ok';
 const count=action=>{
  if(status==='not_collected')return {clicks:null,visitors:null};
  const row=actions.find(r=>r.event==='link_click'&&r.action===action);
  return {clicks:row?.count??0,visitors:row?.visitors??0};
 };
 return {status,collection_start:deploymentCollectionStart,first_complete_day:firstCompleteDay,
  from:from<deploymentCollectionStart?deploymentCollectionStart:from,to,agent_code:deploymentAgentCode,
  local:{clawchat:count('clawchat-local')},cloud:{clawchat:count('clawchat-cloud'),add:count('cloud-add')}};
}
