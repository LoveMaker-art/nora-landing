export const netdiskCollectionStart='2026-10-19';
export function netdiskClicks(actions,from,to){
 const firstCompleteDay='2026-10-20';
 const status=to<netdiskCollectionStart?'not_collected':from<firstCompleteDay?'partial':'ok';
 const row=actions.find(r=>r.event==='link_click'&&r.action==='netdisk-quark');
 return {provider:'quark',status,collection_start:netdiskCollectionStart,first_complete_day:firstCompleteDay,
  from:from<netdiskCollectionStart?netdiskCollectionStart:from,to,
  clicks:status==='not_collected'?null:row?.count??0,visitors:status==='not_collected'?null:row?.visitors??0};
}
