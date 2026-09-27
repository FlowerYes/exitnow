import {writeFile} from 'node:fs/promises';
const id=process.env.SPECTRUM_PROJECT_ID,key=process.env.SPECTRUM_PROJECT_SECRET;
if(!id||!key)throw Error('Photon configuration missing');
const headers={Authorization:'Basic '+Buffer.from(`${id}:${key}`).toString('base64')};
for(const path of [`/projects/${encodeURIComponent(id)}/`,`/projects/${encodeURIComponent(id)}/imessage/`,`/projects/${encodeURIComponent(id)}/billing/subscription`]){
 try{const res=await fetch('https://spectrum.photon.codes'+path,{headers,signal:AbortSignal.timeout(15000)});const body=await res.json();const data=body.data;const safe=(v,depth=0)=>{if(depth>5)return '[nested]';if(Array.isArray(v))return v.map(x=>safe(x,depth+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/secret|token|key|phone|email|address|name|id|url/i.test(k)?'[redacted]':safe(x,depth+1)]));return v};console.log(JSON.stringify({operation:path.endsWith('subscription')?'subscription':path.endsWith('imessage/')?'imessage':'project',http:res.status,succeed:body.succeed,data:safe(data)}));}catch{console.log('Photon preflight request failed (no credentials logged)')}
}
