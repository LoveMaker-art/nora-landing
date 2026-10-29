import {packageUrls} from './sources.js';

export function downloadCandidates(skill,{localPreview=false,baseUrl}={}) {
  return localPreview ? [new URL(skill.package,baseUrl).href] : packageUrls(skill);
}

export async function fetchSkillPackage(skill,{localPreview=false,baseUrl,fetcher=fetch,timeoutMs=15000}={}) {
  if(!Number.isSafeInteger(skill.bytes)||skill.bytes<1||skill.bytes>10*1024*1024||!/^[a-f0-9]{64}$/.test(skill.sha256))throw Error('下载信息暂时不可用，请稍后再试。');
  const attempts=[];
  for(const url of downloadCandidates(skill,{localPreview,baseUrl})) {
    try {
      const response=await fetcher(url,{signal:AbortSignal.timeout(timeoutMs),credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const declared=response.headers.get('content-length');
      if(declared!==null&&Number(declared)!==skill.bytes){await response.body?.cancel();throw Error('文件长度不匹配');}
      if(!response.body)throw Error('下载内容为空');
      const reader=response.body.getReader(),chunks=[];let length=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>skill.bytes){await reader.cancel();throw Error('文件超过预期大小');}chunks.push(value);}}finally{reader.releaseLock();}
      if(length!==skill.bytes)throw Error('文件长度不匹配');
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(hash!==skill.sha256)throw Error('SHA256 校验失败');
      return {bytes,source:url,attempts};
    }catch(error){attempts.push({source:url,error:error.name==='TimeoutError'?'请求超时':error.message});}
  }
  const failure=Error('暂时无法获取技能文件，请稍后再试。');failure.attempts=attempts;throw failure;
}
