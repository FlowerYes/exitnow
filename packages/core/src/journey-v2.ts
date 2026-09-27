/** Journey presentation contract. Coordinates always use [latitude, longitude]. */
export interface JourneyStation {id:string; name:string; lat:number; lng:number; borough:string}
export interface JourneyStep {mode:'walk'|'transit'; vehicleType?:string; line:string; from:string; to:string; departureTime?:string; arrivalTime?:string; minutes:number; path:[number,number][]; color:string}
export interface JourneyOption {id:string; title:string; durationMinutes:number; arrivalTime:string; departureTime:string; transfers:number; walkingMinutes:number; distanceMeters:number; path:[number,number][]; steps:JourneyStep[]; crowding:'unknown'|'low'|'moderate'|'high'; reason:string}
export interface JourneyResult {source:'google'|'demo'; generatedAt:string; origin:JourneyStation; destination:JourneyStation; routes:JourneyOption[]; warnings:string[]}
const stationRows:[string,string,number,number,string][] = [
 ['columbia','116 St–Columbia University',40.807722,-73.964110,'Manhattan'],
 ['times-square','Times Sq–42 St',40.755290,-73.987495,'Manhattan'],
 ['union-square','14 St–Union Sq',40.734673,-73.989951,'Manhattan'],
 ['queens','Court Sq',40.747023,-73.945264,'Queens'],
 ['williamsburg','Bedford Av',40.717304,-73.956872,'Brooklyn'],
 ['brooklyn','Hoyt–Schermerhorn Sts',40.688484,-73.985001,'Brooklyn'],
 ['grand-central','Grand Central–42 St',40.751776,-73.976848,'Manhattan'],
 ['penn-station','34 St–Penn Station',40.750373,-73.991057,'Manhattan'],
 ['columbus-circle','59 St–Columbus Circle',40.768247,-73.981929,'Manhattan'],
 ['fulton','Fulton St',40.710374,-74.007582,'Manhattan'],
 ['canal','Canal St',40.719527,-74.001775,'Manhattan'],
 ['west-fourth','W 4 St–Washington Sq',40.732338,-74.000495,'Manhattan'],
 ['lexington-59','Lexington Av/59 St',40.762526,-73.967967,'Manhattan'],
 ['yankee-stadium','161 St–Yankee Stadium',40.827905,-73.925651,'Bronx'],
 ['149-grand-concourse','149 St–Grand Concourse',40.818375,-73.927351,'Bronx'],
 ['fordham','Fordham Rd (4)',40.862803,-73.901034,'Bronx'],
 ['astoria-ditmars','Astoria–Ditmars Blvd',40.775036,-73.912034,'Queens'],
 ['queensboro-plaza','Queensboro Plaza',40.750582,-73.940202,'Queens'],
 ['jackson-heights','Jackson Hts–Roosevelt Av',40.746644,-73.891338,'Queens'],
 ['forest-hills','Forest Hills–71 Av',40.721691,-73.844521,'Queens'],
 ['flushing','Flushing–Main St',40.759600,-73.830030,'Queens'],
 ['atlantic','Atlantic Av–Barclays Ctr',40.683666,-73.978810,'Brooklyn'],
 ['jay-street','Jay St–MetroTech',40.692338,-73.987342,'Brooklyn'],
 ['broadway-junction','Broadway Junction',40.678334,-73.905316,'Brooklyn'],
 ['coney-island','Coney Island–Stillwell Av',40.577422,-73.981233,'Brooklyn'],
];
export const journeyStations:JourneyStation[] = stationRows.map(([id,name,lat,lng,borough])=>({id,name,lat,lng,borough}));
export class JourneyError extends Error {constructor(message:string,public status=400){super(message);this.name='JourneyError';}}
interface RequestOptions {origin:string; destination:string; preferFewerTransfers?:boolean; now?:Date}
function endpoints(input:RequestOptions){const origin=journeyStations.find(s=>s.id===input.origin), destination=journeyStations.find(s=>s.id===input.destination);if(!origin||!destination)throw new JourneyError('Choose supported origin and destination stations.');if(origin.id===destination.id)throw new JourneyError('Choose two different stations.');const now=input.now??new Date();if(!Number.isFinite(now.getTime()))throw new JourneyError('Invalid departure time.');return {origin,destination,now};}
const position=(s:JourneyStation):[number,number]=>[s.lat,s.lng];
const iso=(date:Date,minutes:number)=>new Date(date.getTime()+minutes*60000).toISOString();
const km=(a:[number,number],b:[number,number])=>Math.hypot((a[0]-b[0])*111.2,(a[1]-b[1])*84.3);
type Geometry={lines:{line:string;coordinates:number[][]}[]};
const services:[string,string,string[]][] = [
 ['1','#E63746',['columbia','columbus-circle','times-square','penn-station']],
 ['A','#2850AD',['columbus-circle','penn-station','west-fourth','canal','fulton','jay-street','brooklyn','broadway-junction']],
 ['4','#008754',['fordham','yankee-stadium','149-grand-concourse','lexington-59','grand-central','union-square','fulton','atlantic']],
 ['N','#D0A800',['astoria-ditmars','queensboro-plaza','lexington-59','times-square','union-square','canal','atlantic','coney-island']],
 ['7','#AE479F',['flushing','jackson-heights','queensboro-plaza','queens','grand-central','times-square']],
 ['E','#2850AD',['forest-hills','jackson-heights','queens','penn-station','west-fourth','canal']],
 ['F','#E76B25',['forest-hills','jackson-heights','west-fourth','jay-street','coney-island']],
 ['L','#85898B',['union-square','williamsburg','broadway-junction']],
 ['G','#6CBE45',['queens','brooklyn']],
 ['R','#D0A800',['forest-hills','jackson-heights','lexington-59','times-square','union-square','canal','jay-street','atlantic']],
];
interface Edge {from:string;to:string;line:string;color:string;minutes:number;load:number;path:[number,number][]}
function shape(from:JourneyStation,to:JourneyStation,line:string,geometry?:Geometry):[number,number][]{
 const coords=geometry?.lines.find(l=>l.line===line)?.coordinates as [number,number][]|undefined;
 if(coords?.length){const nearest=(p:[number,number])=>coords.reduce((best,c,i)=>km(c,p)<km(coords[best],p)?i:best,0);const a=nearest(position(from)),b=nearest(position(to));
 // Only use the line's reference shape when both stations are near it. Still illustrative, never current trip geometry.
 if(a!==b&&km(coords[a],position(from))<0.65&&km(coords[b],position(to))<0.65){const segment=coords.slice(Math.min(a,b),Math.max(a,b)+1);if(a>b)segment.reverse();return [position(from),...segment,position(to)];}}
 return [position(from),position(to)];
}
/** Connected curated demo, not a schedule or an assertion of current service. */
export function planDemoJourney(input:RequestOptions&{geometry?:Geometry;peakOverride?:boolean}):JourneyResult {
 const {origin,destination,now}=endpoints(input);
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now));
 const peak=input.peakOverride??((hour>=7&&hour<10)||(hour>=16&&hour<19));
 const edges:Edge[]=[];
 for(const [line,color,ids] of services){const load=peak?(line==='4'||line==='7'||line==='L'?3:2):(line==='G'?1:2);
  for(let i=1;i<ids.length;i++){const a=journeyStations.find(s=>s.id===ids[i-1])!,b=journeyStations.find(s=>s.id===ids[i])!;const path=shape(a,b,line,input.geometry);const distance=path.slice(1).reduce((sum,p,j)=>sum+km(path[j],p),0);const minutes=Math.max(2,Math.ceil(distance/0.55)+1)+(peak?load:0);
   edges.push({from:a.id,to:b.id,line,color,minutes,load,path},{from:b.id,to:a.id,line,color,minutes,load,path:[...path].reverse()});}}
 type Candidate={at:string;visited:string[];edges:Edge[];cost:number};
 const queue:Candidate[]=[{at:origin.id,visited:[origin.id],edges:[],cost:0}], completed:Candidate[]=[];
 const seenChoices=new Set<string>();
 let explored=0;
 while(queue.length&&completed.length<3&&explored++<30000){queue.sort((a,b)=>a.cost-b.cost);const current=queue.shift()!;if(current.at===destination.id){
   const lines=current.edges.filter((edge,i)=>i===0||edge.line!==current.edges[i-1].line).map(edge=>edge.line);
   const duration=4+current.edges.reduce((sum,edge)=>sum+edge.minutes,0)+(lines.length-1)*7;
   const signature=`${lines.join('>')}:${duration}`;
   if(!seenChoices.has(signature)){seenChoices.add(signature);completed.push(current);}continue;
  }
  for(const edge of edges.filter(e=>e.from===current.at&&!current.visited.includes(e.to))){const previous=current.edges.at(-1),changed=previous&&previous.line!==edge.line;queue.push({at:edge.to,visited:[...current.visited,edge.to],edges:[...current.edges,edge],cost:current.cost+edge.minutes+(!previous?4:changed?7+(input.preferFewerTransfers?8:0):0)});}}
 if(!completed.length)throw new JourneyError('No demo route is available.',503);
 const routes=completed.map((candidate,index):JourneyOption=>{
  const steps:JourneyStep[]=[];let elapsed=4,transfers=0;
  for(const edge of candidate.edges){let last=steps.at(-1);if(last?.line!==edge.line){if(last){elapsed+=7;transfers++;}const from=journeyStations.find(s=>s.id===edge.from)!;last={mode:'transit',line:edge.line,from:from.name,to:'',minutes:0,path:[],color:edge.color,departureTime:iso(now,elapsed)};steps.push(last);}
   elapsed+=edge.minutes;last.minutes+=edge.minutes;last.to=journeyStations.find(s=>s.id===edge.to)!.name;last.path.push(...edge.path);last.arrivalTime=iso(now,elapsed);}
  const path=steps.flatMap(s=>s.path),distanceMeters=Math.round(path.slice(1).reduce((sum,p,j)=>sum+km(path[j],p)*1000,0));
  const rideMinutes=candidate.edges.reduce((sum,edge)=>sum+edge.minutes,0);
  const weightedLoad=candidate.edges.reduce((sum,edge)=>sum+edge.load*edge.minutes,0)/rideMinutes;
  const crowding=weightedLoad<1.5?'low':weightedLoad<2.5?'moderate':'high';
  return {id:`demo-${index}`,title:steps.map(s=>s.line).join(' → '),durationMinutes:elapsed,arrivalTime:iso(now,elapsed),departureTime:now.toISOString(),transfers,walkingMinutes:transfers*3,distanceMeters,path,steps,crowding,reason:`Synthetic ${peak?'rush-hour':'off-peak'} model: ${crowding} crowding, weighted by time on each service. 4 min initial wait; each transfer includes 3 min walking and 4 min waiting.${peak?' Modeled crowding increases segment times.':''}${input.preferFewerTransfers?' Ranked with an 8 min transfer preference.':' Ranked by modeled arrival.'}`};
 });
 return {source:'demo',generatedAt:now.toISOString(),origin,destination,routes,warnings:['Synthetic demo: all ETAs, waits and crowding are modeled, not live transit advice.','Station complexes are curated; intermediate stops are omitted. Lines and map paths are illustrative, not a current service guarantee.',input.geometry?'Paths use matching representative MTA static line shapes where possible; unmatched links are schematic.':'Paths connect station references schematically; they are not exact track geometry.']};
}

const GOOGLE_ROUTES_URL='https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_FIELDS=['routes.duration','routes.distanceMeters','routes.polyline.encodedPolyline','routes.legs.startLocation','routes.legs.endLocation','routes.legs.steps.travelMode','routes.legs.steps.staticDuration','routes.legs.steps.polyline.encodedPolyline','routes.legs.steps.transitDetails'].join(',');
function malformed():never{throw new JourneyError('Google returned incomplete route details. Please try again.',502);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return malformed();return value as Record<string,unknown>;}
function seconds(value:unknown):number{if(typeof value!=='string'||!/^\d+(?:\.\d+)?s$/.test(value))return malformed();const n=Number(value.slice(0,-1));if(!Number.isFinite(n)||n>7*86400)return malformed();return n;}
function timestamp(value:unknown):string{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return malformed();return new Date(value).toISOString();}
function label(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>500)return malformed();return value;}
function decodePolyline(value:unknown,minPoints=2):[number,number][]{
 if(typeof value!=='string'||value.length>250000)return malformed();const points:[number,number][]=[];let index=0,lat=0,lng=0;
 const component=()=>{let result=0,shift=0,byte=0;do{if(index>=value.length||shift>30)return malformed();byte=value.charCodeAt(index++)-63;if(byte<0||byte>63)return malformed();result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return result&1?~(result>>1):result>>1;};
 while(index<value.length){lat+=component();lng+=component();if(Math.abs(lat)>9000000||Math.abs(lng)>18000000)return malformed();points.push([lat/1e5,lng/1e5]);}
 if(points.length<minPoints)return malformed();return points;
}
function googleRoute(value:unknown,index:number,now:Date,origin:JourneyStation,destination:JourneyStation):JourneyOption {
 const route=object(value),durationSeconds=seconds(route.duration),distance=route.distanceMeters;
 if(durationSeconds<=0||typeof distance!=='number'||!Number.isFinite(distance)||distance<0)return malformed();
 const path=decodePolyline(object(route.polyline).encodedPolyline);
 if(!Array.isArray(route.legs)||!route.legs.length||route.legs.length>10)return malformed();
 const steps:JourneyStep[]=[];
 for(const legValue of route.legs){const leg=object(legValue);if(!Array.isArray(leg.steps)||!leg.steps.length||leg.steps.length>300)return malformed();
  for(const stepValue of leg.steps){const step=object(stepValue),mode=step.travelMode;
   if(mode!=='WALK'&&mode!=='TRANSIT')return malformed();
   const stepPath=decodePolyline(object(step.polyline).encodedPolyline,1),minutes=seconds(step.staticDuration)/60;
   if(mode==='WALK'){steps.push({mode:'walk',line:'Walk',from:'Walking connection',to:'Next stop',minutes,path:stepPath,color:'#697787'});continue;}
   const details=object(step.transitDetails),stops=object(details.stopDetails),line=object(details.transitLine),departureTime=timestamp(stops.departureTime),arrivalTime=timestamp(stops.arrivalTime);
   if(Date.parse(arrivalTime)<Date.parse(departureTime))return malformed();
   steps.push({mode:'transit',...(line.vehicle&&typeof object(line.vehicle).type==='string'?{vehicleType:object(line.vehicle).type as string}:{}),line:label(line.nameShort??line.name),from:label(object(stops.departureStop).name),to:label(object(stops.arrivalStop).name),departureTime,arrivalTime,minutes:(Date.parse(arrivalTime)-Date.parse(departureTime))/60000,path:stepPath,color:typeof line.color==='string'&&/^#[\da-f]{6}$/i.test(line.color)?line.color:'#3567BD'});
  }
 }
 for(let i=0;i<steps.length;i++)if(steps[i].mode==='walk'){
  const before=steps[i-1],after=steps[i+1];
  steps[i].from=!before?origin.name:before.mode==='transit'?before.to:'Continue walking';
  steps[i].to=!after?destination.name:after.mode==='transit'?after.from:'Next walking segment';
 }
 const transit=steps.filter(s=>s.mode==='transit');
 if(!transit.length)return {id:`google-${index}`,title:'Walk',durationMinutes:durationSeconds/60,arrivalTime:iso(now,durationSeconds/60),departureTime:now.toISOString(),transfers:0,walkingMinutes:durationSeconds/60,distanceMeters:distance,path,steps,crowding:'unknown',reason:'Google returned a walking route for these nearby locations. Duration includes the complete walk.'};
 let previousArrival=now.getTime()-60000;
 for(const step of transit){if(Date.parse(step.departureTime!)<previousArrival)return malformed();previousArrival=Date.parse(step.arrivalTime!);}
 const lastTransitIndex=steps.findLastIndex(s=>s.mode==='transit');
 const trailingWalk=steps.slice(lastTransitIndex+1).reduce((sum,s)=>sum+s.minutes,0);
 // Anchor ETA in Google's actual stop timestamp, then add the returned final walk.
 const arrivalMs=Date.parse(transit.at(-1)!.arrivalTime!)+trailingWalk*60000;
 const departureMs=arrivalMs-durationSeconds*1000;
 if(arrivalMs<now.getTime()||departureMs<now.getTime()-60000||departureMs>Date.parse(transit[0].departureTime!))return malformed();
 return {id:`google-${index}`,title:transit.map(s=>s.line).join(' → '),durationMinutes:durationSeconds/60,arrivalTime:new Date(arrivalMs).toISOString(),departureTime:new Date(departureMs).toISOString(),transfers:transit.length-1,walkingMinutes:steps.filter(s=>s.mode==='walk').reduce((sum,s)=>sum+s.minutes,0),distanceMeters:distance,path,steps,crowding:'unknown',reason:'Google transit estimate. Departure and arrival times come from returned transit stop details; final walking time is included. Crowding is not supplied.'};
}

interface LiveEndpoint {name:string;station?:JourneyStation}
function liveEndpoint(value:string):LiveEndpoint {
 if(typeof value!=='string'||!value.trim()||value.trim().length>500)throw new JourneyError('Enter a place or address for both locations.');
 const name=value.trim(),station=journeyStations.find(s=>s.id===name);
 return {name:station?.name??name,station};
}
function resolvedEndpoint(input:LiveEndpoint,location:unknown):JourneyStation {
 // Legacy catalog fixtures may omit locations; arbitrary addresses require Google's resolved point.
 if(location===undefined&&input.station)return input.station;
 const point=object(object(location).latLng),lat=point.latitude??0,lng=point.longitude??0;
 if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return malformed();
 return {id:input.station?.id??input.name,name:input.name,lat,lng,borough:input.station?.borough??''};
}

/** Server-side only when credentials are passed. Never call with a browser key. */
export async function fetchGoogleJourneys(input:RequestOptions&{apiKey:string;fetcher?:typeof fetch;timeoutMs?:number}):Promise<JourneyResult>{
 const originInput=liveEndpoint(input.origin),destinationInput=liveEndpoint(input.destination),now=input.now??new Date();
 if(originInput.name.toLowerCase()===destinationInput.name.toLowerCase())throw new JourneyError('Choose two different locations.');
 if(!Number.isFinite(now.getTime()))throw new JourneyError('Invalid departure time.');
 if(!input.apiKey?.trim())throw new JourneyError('Google routing is not configured. Choose the synthetic demo or add a server API key.',503);
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const waypoint=(s:LiveEndpoint)=>s.station?{location:{latLng:{latitude:s.station.lat,longitude:s.station.lng}}}:{address:s.name};
 try{
  const task=(async()=>{const response=await (input.fetcher??fetch)(GOOGLE_ROUTES_URL,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','X-Goog-Api-Key':input.apiKey,'X-Goog-FieldMask':GOOGLE_FIELDS},body:JSON.stringify({origin:waypoint(originInput),destination:waypoint(destinationInput),travelMode:'TRANSIT',departureTime:now.toISOString(),computeAlternativeRoutes:true,languageCode:'en-US',regionCode:'us',transitPreferences:{...(input.preferFewerTransfers?{routingPreference:'FEWER_TRANSFERS'}:{})}})});
   if(!response.ok)throw new JourneyError(response.status===403?'Google routing is unavailable. Check the server key, billing and Routes API access.':'Google routing is unavailable. Please try again.',502);
   const raw=await response.text();if(raw.length>2000000)return malformed();const body=object(JSON.parse(raw));
   if(body.routes===undefined||(Array.isArray(body.routes)&&!body.routes.length))throw new JourneyError('Google found no transit routes for this trip. Try another address or departure location.',503);
   if(!Array.isArray(body.routes)||body.routes.length>10)return malformed();
   const first=object(body.routes[0]);if(!Array.isArray(first.legs)||!first.legs.length)return malformed();
   const origin=resolvedEndpoint(originInput,object(first.legs[0]).startLocation),destination=resolvedEndpoint(destinationInput,object(first.legs.at(-1)).endLocation);
   const routes=body.routes.map((r,i)=>googleRoute(r,i,now,origin,destination));
   return {source:'google' as const,generatedAt:now.toISOString(),origin,destination,routes,warnings:['Google transit estimates may include scheduled and realtime information; they are not guaranteed arrival times.','Crowding and accessibility have not been verified.']};
  })();
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new JourneyError('Google routing timed out. Please try again.',504));},Math.max(1,Math.min(input.timeoutMs??10000,15000)));});
  return await Promise.race([task,timeout]);
 }catch(error){if(error instanceof JourneyError)throw error;throw new JourneyError('Google routing could not be read. Please try again.',502);}finally{if(timer)clearTimeout(timer);}
}
