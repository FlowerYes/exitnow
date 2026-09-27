import {z} from 'zod';
const date=z.string().datetime();
const schema=z.object({phone:z.string().max(30).transform(v=>v.replace(/[ ()-]/g,'')).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/)),consent:z.literal(true),source:z.enum(['google','demo']),origin:z.string().trim().min(1).max(160),destination:z.string().trim().min(1).max(160),arrivalTime:date,generatedAt:date,departureTime:date});
export function parseEta(input:unknown,now=Date.now()){
 const v=schema.parse(input);
 if(Date.parse(v.generatedAt)>now+30000||now-Date.parse(v.generatedAt)>120000)throw Error('Refresh your route before sending an ETA.');
 if(v.source==='google'&&(Date.parse(v.departureTime)<=now||Date.parse(v.arrivalTime)<=now))throw Error('This departure has passed. Refresh your route.');
 if(Date.parse(v.arrivalTime)<Date.parse(v.departureTime))throw Error('Invalid journey times.');
 return v;
}
export function buildEtaText(v:ReturnType<typeof parseEta>){const at=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).format(new Date(v.arrivalTime));return `${v.source==='demo'?'SYNTHETIC DEMO — not a real arrival update.\n':''}ExitNow: Your friend shared their trip from ${v.origin} to ${v.destination}. Estimated arrival: ${at} ET. Times may change. One-time ETA update.`;}
export class EtaLimiter{
 private records:{account:string;phone:string;message:string;at:number}[]=[];
 reserve(account:string,phone:string,message:string,now=Date.now()){
  this.records=this.records.filter(r=>now-r.at<3600000);
  if(this.records.length>=20||this.records.filter(r=>r.account===account).length>=5||this.records.some(r=>r.phone===phone&&(now-r.at<60000||r.message===message)))return false;
  this.records.push({account,phone,message,at:now});return true;
 }
}
