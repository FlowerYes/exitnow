/** Parsed official GTFS tables. ZIP/CSV extraction is an explicit upstream step. */
export interface GtfsTables {
 stops:{stop_id:string;stop_name:string;wheelchair_boarding?:string}[];
 trips:{trip_id:string;route_id:string;service_id:string;direction_id?:string;trip_headsign?:string;wheelchair_accessible?:string}[];
 stopTimes:{trip_id:string;stop_id:string;stop_sequence:number;arrival_time:string;departure_time:string}[];
 calendar:{service_id:string;start_date:string;end_date:string;days:number[]}[];
 calendarDates:{service_id:string;date:string;exception_type:1|2}[];
 transfers:{from_stop_id:string;to_stop_id:string;min_transfer_time:number;transfer_type?:number}[];
}
export const gtfsSeconds=(time:string)=>{const [h,m,s]=time.split(':').map(Number);if(![h,m,s].every(Number.isFinite)||m>59||s>59)throw new Error('Invalid GTFS time');return h*3600+m*60+s;};
export function serviceActive(t:GtfsTables,service:string,date:string){const exception=t.calendarDates.find(c=>c.service_id===service&&c.date===date);if(exception)return exception.exception_type===1;const day=new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T12:00:00Z`).getUTCDay();return t.calendar.some(c=>c.service_id===service&&c.start_date<=date&&c.end_date>=date&&c.days.includes(day));}
/** Connection scan with explicit service-date and seconds-after-midnight (supports 25:00). */
export function routeGtfs(t:GtfsTables,request:{origin:string;destination:string;serviceDate:string;departureSeconds:number;blockedTrips?:string[];blockedRoutes?:string[];accessible?:boolean}) {
 const trips=new Map(t.trips.filter(tr=>serviceActive(t,tr.service_id,request.serviceDate)&&!request.blockedTrips?.includes(tr.trip_id)&&!request.blockedRoutes?.includes(tr.route_id)&&(!request.accessible||tr.wheelchair_accessible==='1')).map(tr=>[tr.trip_id,tr]));
 const grouped=new Map<string,GtfsTables['stopTimes']>();for(const s of t.stopTimes){if(!trips.has(s.trip_id))continue;const a=grouped.get(s.trip_id)||[];a.push(s);grouped.set(s.trip_id,a);}
 const connections=[...grouped.entries()].flatMap(([id,rows])=>{rows.sort((a,b)=>a.stop_sequence-b.stop_sequence);return rows.slice(1).map((r,i)=>({from:rows[i].stop_id,to:r.stop_id,departure:gtfsSeconds(rows[i].departure_time),arrival:gtfsSeconds(r.arrival_time),trip:trips.get(id)!}));}).sort((a,b)=>a.departure-b.departure);
 type Step={from:string;to:string;arrival:number;departure:number;trip?:GtfsTables['trips'][number]};
 const arrivals=new Map<string,number>([[request.origin,request.departureSeconds]]),paths=new Map<string,Step[]>([[request.origin,[]]]);
 const allowed=(id:string)=>!request.accessible||t.stops.find(s=>s.stop_id===id)?.wheelchair_boarding==='1';
 if(!allowed(request.origin))throw new Error('Origin accessibility unverified');
 function walks(){for(let pass=0;pass<t.stops.length;pass++){let changed=false;for(const e of t.transfers){if(e.transfer_type===3||!allowed(e.to_stop_id)||request.accessible)continue;const from=arrivals.get(e.from_stop_id);if(from===undefined)continue;const end=from+Math.max(e.min_transfer_time,0);if(end<(arrivals.get(e.to_stop_id)??Infinity)){arrivals.set(e.to_stop_id,end);paths.set(e.to_stop_id,[...paths.get(e.from_stop_id)!,{from:e.from_stop_id,to:e.to_stop_id,departure:from,arrival:end}]);changed=true;}}if(!changed)break;}}
 walks();for(const c of connections){if(!allowed(c.to))continue;const at=arrivals.get(c.from);const path=paths.get(c.from)||[];const previous=path.at(-1);const required=previous?.trip&&previous.trip.trip_id!==c.trip.trip_id?Math.max(0,...t.transfers.filter(x=>x.from_stop_id===c.from&&x.to_stop_id===c.from).map(x=>x.min_transfer_time)):0;if(at!==undefined&&at+required<=c.departure&&c.arrival<(arrivals.get(c.to)??Infinity)){arrivals.set(c.to,c.arrival);paths.set(c.to,[...path,c]);walks();}}
 if(!arrivals.has(request.destination))throw new Error('No scheduled route for this service date and constraints');return {arrivalSeconds:arrivals.get(request.destination)!,legs:paths.get(request.destination)!};
}
export class SharedFeedCollector {
 private cache=new Map<string,{bytes:Uint8Array;fetchedAt:number;sourceTimestamp?:number;error?:string}>();private pending=new Map<string,Promise<unknown>>();
 constructor(readonly minimumPollMs=30000){}
 async collect(url:string,now=Date.now()){const old=this.cache.get(url);if(old&&now-old.fetchedAt<this.minimumPollMs)return {...old,stale:now-old.fetchedAt>90000};if(this.pending.has(url)){await this.pending.get(url);return this.cache.get(url);}
 const job=(async()=>{try{const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Feed HTTP ${response.status}`);const record={bytes:new Uint8Array(await response.arrayBuffer()),fetchedAt:now};this.cache.set(url,record);return {...record,stale:false};}catch(error){if(old){const stale={...old,error:String(error)};this.cache.set(url,stale);return {...stale,stale:true};}throw error;}})();this.pending.set(url,job);try{return await job;}finally{this.pending.delete(url);}
 }
}
