const inFlight=new WeakMap();
const quotaKey='https://noratavern.com/__nora_cache/d1-read-limit-v1';
const DAY=86400000;
const quotaError=error=>/D1.*daily row read limit|exceeded.*daily.*row.*read/i.test(String(error?.message||''));
function client(response,state){
 const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Nora-Cache',state);
 return new Response(response.body,{status:response.status,headers});
}
async function match(cache,key){try{return await cache?.match(key);}catch{return null;}}
async function put(cache,key,response,ttl){
 if(!cache)return;
 const headers=new Headers(response.headers);headers.set('Cache-Control','public, max-age='+ttl);
 try{await cache.put(key,new Response(response.clone().body,{status:response.status,headers}));}catch{console.warn('Aggregate cache write unavailable.');}
}

// Call only after authentication, and only for aggregate statistics, not raw logs.
export async function aggregateRead(request,load,{cache=globalThis.caches?.default,ttl=900}={}){
 const url=new URL(request.url);url.searchParams.sort();url.pathname='/__nora_cache/aggregate-v1'+url.pathname;
 const key=url.href,saved=await match(cache,key);
 if(saved?.ok)return client(saved,'hit');
 const limited=await match(cache,quotaKey);
 if(limited)return client(limited,'quota');
 let pending=cache&&inFlight.get(cache);
 if(cache&&!pending){pending=new Map();inFlight.set(cache,pending);}
 if(pending?.has(key))return client((await pending.get(key)).clone(),'coalesced');
 const job=(async()=>{
  try{
   const response=await load();
   if(response.ok)await put(cache,key,response,ttl);
   return response;
  }catch(error){
   if(!quotaError(error))throw error;
   const now=Date.now(),reset=(Math.floor(now/DAY)+1)*DAY,seconds=Math.ceil((reset-now)/1000);
   const response=Response.json({error:'daily_read_limit',retry_at:new Date(reset).toISOString()},
    {status:503,headers:{'Cache-Control':'no-store','Retry-After':String(seconds)}});
   console.warn('D1 daily read quota exhausted; statistics paused until UTC midnight.');
   await put(cache,quotaKey,response,seconds);
   return response;
  }
 })();
 pending?.set(key,job);
 try{return client((await job).clone(),'miss');}finally{pending?.delete(key);}
}
