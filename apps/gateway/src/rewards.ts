import {demoNetwork} from '../../../packages/core/src/index.ts';
import {mtaStations} from '../../../packages/core/src/mta.ts';
/** Only context extraction lives here. Eligibility and amounts belong to RewardsService. */
export const reportCategories=['platform_crowding','boarding_difficulty','elevator_status','escalator_status','entrance_obstruction'] as const;
export type ReportCategory=typeof reportCategories[number];
export interface ObservationInput {station:string;category:ReportCategory;condition:string;observedAt:number;asset?:string;direction?:string;platform?:string;evidenceRefs?:string[];taskId?:string}
const short=(v:unknown)=>typeof v==='string'?v.trim().slice(0,160):'';
export function canonicalStation(value:string){const key=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,'');const match=[...mtaStations,...demoNetwork.stations].find(s=>key(s.id)===key(value)||key(s.name)===key(value));return match?.id??value.trim().toLowerCase();}
export function observationInput(input:Record<string,unknown>):{missing:string[];report:ObservationInput}{
 const station=canonicalStation(short(input.station)),category=short(input.category) as ReportCategory,condition=short(input.condition),asset=short(input.asset),direction=short(input.direction),platform=short(input.platform);
 const observedAt=typeof input.observedAt==='number'?input.observedAt:typeof input.observedAt==='string'?Date.parse(input.observedAt):NaN;
 const missing:string[]=[];
 if(!station)missing.push('station');if(!reportCategories.includes(category))missing.push('category');if(!condition)missing.push('condition');if(!Number.isFinite(observedAt))missing.push('observedAt');
 if(['elevator_status','escalator_status','entrance_obstruction'].includes(category)&&!asset)missing.push('asset');
 if(['platform_crowding','boarding_difficulty'].includes(category)&&!direction&&!platform)missing.push('direction or platform');
 return {missing,report:{station,category,condition,observedAt,...(asset?{asset}:{}),...(direction?{direction}:{}),...(platform?{platform}:{}),...(Array.isArray(input.evidenceRefs)?{evidenceRefs:input.evidenceRefs.filter((x):x is string=>typeof x==='string').slice(0,5)}:{}),...(short(input.taskId)?{taskId:short(input.taskId)}:{})}};
}
export interface GuidanceObservation {id:string;station:string;category:string;condition:string;observedAt:number;liveUntil?:number;expiresAt?:number;status?:string;verification?:string;asset?:string;direction?:string;platform?:string}
const normalizedDirection=(value:string)=>({downtown:'southbound',uptown:'northbound'}[value.toLowerCase()]??value.toLowerCase());
export function guidanceForTrip(reports:GuidanceObservation[],route:unknown,now=Date.now()){
 const legs=(route as {recommended?:{legs?:Array<{from:string;to:string;direction?:string}>}}|undefined)?.recommended?.legs??[];
 return reports.filter(r=>(r.status==='verified'||(!r.status&&!!r.verification))&&(r.liveUntil??r.expiresAt??0)>now&&legs.some(l=>(l.from===canonicalStation(r.station)||l.to===canonicalStation(r.station))&&(!r.direction||normalizedDirection(r.direction)===normalizedDirection(l.direction??'')))).map(r=>({id:r.id,station:r.station,category:r.category,condition:r.condition,asset:r.asset,direction:r.direction,platform:r.platform,observedAt:r.observedAt,liveUntil:r.liveUntil??r.expiresAt,status:'verified',message:`Verified rider observation at ${r.station}${r.asset?` (${r.asset})`:''}: ${r.category.replaceAll('_',' ')} — ${r.condition.replaceAll('_',' ')}. Confirm local signage; this does not establish an accessible route.`}));
}
