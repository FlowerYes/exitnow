import {persistInbound} from './ingestion.ts';
import {Spectrum} from 'spectrum-ts';
import {imessage} from 'spectrum-ts/providers/imessage';
import type {Inbound,Job,Trip} from './state.ts';
export interface Messenger {send(trip:Trip,recipient:string,text:string):Promise<void>}
export async function photon(onInbound:(event:Inbound)=>Promise<unknown>) {
 const app=await Spectrum({projectId:process.env.SPECTRUM_PROJECT_ID!,projectSecret:process.env.SPECTRUM_PROJECT_SECRET!,providers:[imessage.config()]});
 const provider=imessage(app);
 const reader=(async()=>{for await(const [space,message] of app.messages){if(message.platform!=='imessage'||message.direction!=='inbound'||message.content.type!=='text'||!message.sender)continue;const im=imessage(space);if(im.type!=='dm')continue;await persistInbound({eventId:message.id,tripId:space.id,sender:message.sender.id,spaceId:space.id,phone:im.phone,text:message.content.text,timestamp:message.timestamp.getTime()},onInbound);}})();
 const messenger:Messenger={async send(t,recipient,text){const space=recipient==='rider'?await provider.space.get(t.spaceId,t.phone?{phone:t.phone}:undefined):await provider.space.create(await provider.user(t.consents[recipient].route),t.phone?{phone:t.phone}:undefined);await space.send(text);}};
 return {messenger,reader,stop:()=>app.stop()};
}
export async function dispatchGrok(j:Job) {
 const url=process.env.GROK_BOT_WEBHOOK_URL,key=process.env.GROK_BOT_WEBHOOK_KEY,base=process.env.GATEWAY_PUBLIC_URL;
 if(!url||!key||!base)throw Error('Grok Bot routine configuration missing');
 const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({jobId:j.id,message:j.text,toolBaseUrl:`${base}/jobs/${j.id}/tools`,token:j.token,expiresAt:new Date(j.expires).toISOString()}),signal:AbortSignal.timeout(15000)});
 if(response.status!==200)throw Error(`Grok routine rejected dispatch (${response.status})`);
 // HTTP 200 is acceptance, never a completed rider answer.
}
