import protobuf from 'protobufjs';
import schemaDefinition from '../proto/gtfs-realtime.json';
// Generated from the adjacent vendored official schema. Bundling the descriptor
// avoids runtime filesystem paths, which Next.js rewrites when packaging routes.
const schema=Promise.resolve(protobuf.Root.fromJSON(schemaDefinition).lookupType('transit_realtime.FeedMessage'));
export interface RealtimeEntity {
 id:string;
 tripUpdate?:{trip:{tripId?:string;routeId?:string;startDate?:string;scheduleRelationship?:string};stopTimeUpdate?:{stopId?:string;stopSequence?:number;arrival?:{time?:string;delay?:number;uncertainty?:number};departure?:{time?:string;delay?:number;uncertainty?:number};scheduleRelationship?:string}[];timestamp?:string};
 alert?:Record<string,unknown>;
 vehicle?:Record<string,unknown>;
}
export interface RealtimeSnapshot {sourceTimestamp:number|null;fetchedAt:number;stale:boolean;incrementality:string;entities:RealtimeEntity[];warnings:string[];error?:string}
/** Standard GTFS-RT fields only. MTA extensions are not used for route inference. */
export async function decodeRealtime(bytes:Uint8Array,fetchedAt=Date.now()):Promise<RealtimeSnapshot>{
 const type=await schema;const message=type.decode(bytes);const data=type.toObject(message,{longs:String,enums:String}) as {header:{timestamp?:string;incrementality?:string};entity?:RealtimeEntity[]};
 const sourceTimestamp=data.header.timestamp===undefined?null:Number(data.header.timestamp)*1000;
 if(sourceTimestamp!==null&&!Number.isSafeInteger(sourceTimestamp))throw new Error('Invalid realtime source timestamp');
 const incrementality=data.header.incrementality??'FULL_DATASET';if(incrementality!=='FULL_DATASET')throw new Error('Differential realtime snapshots require a merger and are unsupported');
 return {sourceTimestamp,fetchedAt,stale:sourceTimestamp===null||fetchedAt-sourceTimestamp>90000||sourceTimestamp>fetchedAt+30000,incrementality,entities:data.entity??[],warnings:['Standard GTFS-RT decoded; MTA-specific extensions are not interpreted.','Realtime predictions are not yet applied to the route engine.',...(sourceTimestamp===null?['Feed header timestamp missing; freshness is unknown.']:[])]};
}
/** Fixture helper only: never produces live evidence. */
export async function encodeRealtimeFixture(value:Record<string,unknown>){const type=await schema;const error=type.verify(value);if(error)throw new Error(error);return type.encode(type.create(value)).finish();}
export class RealtimeCollector {
 private cache=new Map<string,RealtimeSnapshot>();private pending=new Map<string,Promise<RealtimeSnapshot>>();private nextAttempt=new Map<string,number>();private failures=new Map<string,number>();
 private fetcher:typeof fetch;private pollMs:number;
 constructor(options:{fetcher?:typeof fetch;pollMs?:number}={}){this.fetcher=options.fetcher??fetch;this.pollMs=Math.max(1000,options.pollMs??30000);}
 async collect(url:string,now=Date.now()):Promise<RealtimeSnapshot>{
 const underway=this.pending.get(url);if(underway)return underway;
 const cached=this.cache.get(url);if(now<(this.nextAttempt.get(url)??0)){if(!cached)throw new Error('Feed backoff active; no cached data');return {...cached,stale:!!cached.error||cached.sourceTimestamp===null||now-cached.sourceTimestamp>90000||cached.sourceTimestamp>now+30000};}
 const job=(async()=>{try{const response=await this.fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new Error(`Realtime HTTP ${response.status}`);const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>20*1024*1024)throw new Error('Realtime feed exceeds size limit');const decoded=await decodeRealtime(bytes,now);this.cache.set(url,decoded);this.failures.set(url,0);this.nextAttempt.set(url,now+this.pollMs);return decoded;
 }catch(error){const failures=(this.failures.get(url)??0)+1;this.failures.set(url,failures);this.nextAttempt.set(url,now+Math.min(300000,this.pollMs*2**Math.min(failures-1,4)));if(!cached)throw error;const failed={...cached,stale:true,error:error instanceof Error?error.message:'Feed collection failed'};this.cache.set(url,failed);return failed;}})();
 this.pending.set(url,job);try{return await job;}finally{this.pending.delete(url);}
 }
}
