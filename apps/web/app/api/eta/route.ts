import {Spectrum} from 'spectrum-ts';
import {imessage} from 'spectrum-ts/providers/imessage';
import {authenticateRider} from '../../../../../packages/rewards/src/auth';
import {boundedBody} from '../../../../../packages/planning/src/operator';
import {parseEta,buildEtaText,EtaLimiter} from './service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const state=globalThis as typeof globalThis & {etaPhoton?:ReturnType<typeof Spectrum>;etaLimiter?:EtaLimiter};
function client(){if(!state.etaPhoton){state.etaPhoton=Spectrum({projectId:process.env.SPECTRUM_PROJECT_ID!,projectSecret:process.env.SPECTRUM_PROJECT_SECRET!,providers:[imessage.config()]});state.etaPhoton.catch(()=>{state.etaPhoton=undefined;});}return state.etaPhoton;}
export async function POST(request:Request){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(!origin||origin!==url.origin)return Response.json({error:'Send this update from the ExitNow app.'},{status:403,headers});
 const local=process.env.NODE_ENV==='development'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const session=authenticateRider(request);
 if(!local&&!session)return Response.json({error:'Enter your private rider access code from ExitNow messaging to send via Photon.'},{status:401,headers});
 if(!process.env.SPECTRUM_PROJECT_ID||!process.env.SPECTRUM_PROJECT_SECRET)return Response.json({error:'Photon is not configured on this server.'},{status:503,headers});
 let value;try{value=parseEta(await boundedBody(request));}catch{return Response.json({error:'Use a phone number with +country code, confirm consent, and refresh your route before sending.'},{status:400,headers});}
 const text=buildEtaText(value);
 state.etaLimiter??=new EtaLimiter();
 if(!state.etaLimiter.reserve(session?.accountId??'local-preview',value.phone,text))return Response.json({error:'This update was already attempted or the sending limit was reached. Check with your friend before retrying later.'},{status:429,headers});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const sending=(async()=>{const provider=imessage(await client());const user=await provider.user(value.phone);const dm=await provider.space.create(user);const sent=await dm.send(text);if(!sent?.id)throw Error('No provider acknowledgment');return sent.id;})();
  const messageId=await Promise.race([sending,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Provider timeout')),20000);})]);
  return Response.json({accepted:true,messageId},{status:202,headers});
 }catch{return Response.json({error:'Photon could not confirm acceptance. The message may still arrive; do not immediately resend.'},{status:502,headers});}
 finally{if(timer)clearTimeout(timer);}
}
