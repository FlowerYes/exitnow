import {randomUUID, randomBytes, timingSafeEqual} from 'node:crypto';
import type {ObservationInput} from './rewards.ts';
export type Status='pending'|'running'|'completed'|'failed'|'timed-out';
export interface Consent {evidenceReference?:string;grantedAt?:number;arrivalSentDestination?:string;allowed:boolean;destination:string;route:string;lastSent?:number;lastEta?:number;lastIncident?:string}
export interface Trip {id:string;version:number;sender:string;spaceId:string;phone?:string;lastTimestamp:number;destination?:string;arrived:boolean;analytics:boolean;consents:Record<string,Consent>;route?:unknown;guidanceIds?:string[];rewardDraft?:{input:ObservationInput;preparedJobId:string;taskId?:string;expiresAt?:number;submittedReportId?:string;funded:boolean;provisionalAmount:number}}
export interface RouteFixture {origin:string;destination:string;departureTime:string}
export interface Job {fixture?:RouteFixture;id:string;tripId:string;version:number;text:string;status:Status;created:number;expires:number;token:string;error?:string}
export interface Notification {observationId?:string;expiresAt?:number;version?:number;id:string;tripId:string;recipient:string;text:string;kind:'rider'|'eta'|'arrival';eta?:number;incident?:string;status:'pending'|'sending'|'sent'|'suppressed'|'uncertain'}
export interface State {events:string[];trips:Record<string,Trip>;jobs:Job[];outbox:Notification[]}
export const emptyState=():State=>({events:[],trips:{},jobs:[],outbox:[]});
export interface Inbound {fixture?:RouteFixture;eventId:string;tripId:string;sender:string;spaceId:string;phone?:string;text:string;timestamp:number}
export function ingest(s:State,e:Inbound,now=Date.now()) {
 if(s.events.includes(e.eventId)) return {duplicate:true};
 let t=s.trips[e.tripId]; if(t && e.timestamp<t.lastTimestamp) throw Error('outdated event');
 if(t && t.sender!==e.sender) throw Error('unauthorized sender');
 t??={id:e.tripId,version:0,sender:e.sender,spaceId:e.spaceId,phone:e.phone,lastTimestamp:0,arrived:false,analytics:false,consents:{}};
 t.version++;t.lastTimestamp=e.timestamp;s.trips[t.id]=t;s.events.push(e.eventId);
 for(const old of s.jobs)if(old.tripId===t.id&&['pending','running'].includes(old.status)){old.status='failed';old.error='Superseded by newer trip input';}
 if(/^stop\s+sharing\b/i.test(e.text.trim())) for(const c of Object.values(t.consents)) c.allowed=false;
 if(/^i arrived[.!]?$/i.test(e.text.trim()))t.arrived=true;
 const j:Job={fixture:e.fixture,id:randomUUID(),tripId:t.id,version:t.version,text:e.text,status:'pending',created:now,expires:now+300000,token:randomBytes(32).toString('hex')};s.jobs.push(j);
 s.outbox.push({id:randomUUID(),tripId:t.id,version:t.version,recipient:'rider',text:/^stop\s+sharing\b/i.test(e.text.trim())?'Sharing stopped. Queued recipient updates are cancelled.':'Got it. I’m checking your journey.',kind:'rider',status:'pending'});
 return {duplicate:false,jobId:j.id};
}
export function claim(s:State,now=Date.now()) {
 for(const j of s.jobs)if(['pending','running'].includes(j.status)&&j.version!==s.trips[j.tripId]?.version){j.status='failed';j.error='Superseded by newer trip input';}
 for(const j of s.jobs)if(['pending','running'].includes(j.status)&&j.expires<=now){j.status='timed-out';j.error='Routine exceeded five-minute deadline';}
 const j=s.jobs.find(j=>j.status==='pending'&&!s.jobs.some(p=>p.tripId===j.tripId&&p.status==='running'));
 if(j)j.status='running';return j;
}
export function authorize(s:State,id:string,token:string,now=Date.now()) {
 const j=s.jobs.find(j=>j.id===id);if(!j||token.length!==j.token.length||!timingSafeEqual(Buffer.from(token),Buffer.from(j.token)))throw Error('unauthorized');
 if(j.expires<=now)throw Error('expired');if(s.trips[j.tripId].version!==j.version)throw Error('outdated');if(j.status!=='running')throw Error('inactive');return j;
}
export function complete(s:State,id:string,token:string,text:string,now=Date.now()) {
 const j=authorize(s,id,token,now);if(!text.trim()||text.length>3000)throw Error('invalid result');
 j.status='completed';s.outbox.push({id:randomUUID(),tripId:j.tripId,version:j.version,recipient:'rider',text,kind:'rider',status:'pending'});
}
export function eligible(s:State,n:Notification,now=Date.now()) {
 const t=s.trips[n.tripId];if((n.expiresAt!==undefined&&n.expiresAt<=now)||!t||(n.version!==undefined&&n.version!==t.version))return false;if(n.kind==='rider')return n.recipient==='rider';
 const c=t.consents[n.recipient];if(!c?.allowed||!t.destination||c.destination!==t.destination)return false;
 if(c.lastSent!==undefined&&now-c.lastSent<300000)return false;
 if(n.kind==='arrival')return t.arrived&&c.arrivalSentDestination!==t.destination;
 if(n.incident&&n.incident===c.lastIncident)return false;
 return n.eta!==undefined&&(c.lastEta===undefined||Math.abs(n.eta-c.lastEta)>=300000);
}
