import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {gtfsSeconds,type GtfsTables} from './gtfs.ts';
const run=promisify(execFile);
export const OFFICIAL_SUPPLEMENTED_GTFS='https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip';
const names=['stops.txt','trips.txt','stop_times.txt','calendar.txt','calendar_dates.txt','transfers.txt'] as const;
export function parseCsv(text:string):Record<string,string>[] {
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw new Error('Unterminated CSV quote');if(field||row.length){row.push(field);rows.push(row);}const headers=rows.shift()?.map(s=>s.replace(/^\uFEFF/,''));if(!headers)return [];
 if(new Set(headers).size!==headers.length)throw new Error('Duplicate CSV header');return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV column mismatch at row ${i+2}`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
const required=(r:Record<string,string>,name:string)=>{if(!r[name])throw new Error(`Missing ${name}`);return r[name];};
const integer=(s:string,name:string)=>{if(!/^\d+$/.test(s))throw new Error(`Invalid ${name}`);return Number(s);};
export function parseGtfsTables(files:Partial<Record<typeof names[number],string>>):GtfsTables {
 const get=(name:typeof names[number],required=false)=>{if(files[name]===undefined&&required)throw new Error(`Missing ${name}`);return parseCsv(files[name]??'');};
 const stops=get('stops.txt',true).map(r=>({stop_id:required(r,'stop_id'),stop_name:required(r,'stop_name'),wheelchair_boarding:r.wheelchair_boarding||undefined}));
 const trips=get('trips.txt',true).map(r=>({trip_id:required(r,'trip_id'),route_id:required(r,'route_id'),service_id:required(r,'service_id'),direction_id:r.direction_id||undefined,trip_headsign:r.trip_headsign||undefined,wheelchair_accessible:r.wheelchair_accessible||undefined}));
 const stopTimes=get('stop_times.txt',true).map(r=>{const arrival_time=required(r,'arrival_time'),departure_time=required(r,'departure_time');gtfsSeconds(arrival_time);gtfsSeconds(departure_time);return {trip_id:required(r,'trip_id'),stop_id:required(r,'stop_id'),stop_sequence:integer(required(r,'stop_sequence'),'stop_sequence'),arrival_time,departure_time};});
 const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 const calendar=get('calendar.txt').map(r=>({service_id:required(r,'service_id'),start_date:required(r,'start_date'),end_date:required(r,'end_date'),days:weekdays.flatMap((d,i)=>r[d]==='1'?[i]:[])}));
 const calendarDates=get('calendar_dates.txt').map(r=>{const e=integer(required(r,'exception_type'),'exception_type');if(e!==1&&e!==2)throw new Error('Invalid calendar exception');return {service_id:required(r,'service_id'),date:required(r,'date'),exception_type:e as 1|2};});
 if(!calendar.length&&!calendarDates.length)throw new Error('No service calendar');
 const transfers=get('transfers.txt').map(r=>({from_stop_id:required(r,'from_stop_id'),to_stop_id:required(r,'to_stop_id'),min_transfer_time:r.min_transfer_time?integer(r.min_transfer_time,'min_transfer_time'):0,transfer_type:r.transfer_type?integer(r.transfer_type,'transfer_type'):0}));
 const stopIds=new Set(stops.map(s=>s.stop_id)),tripIds=new Set(trips.map(t=>t.trip_id)),services=new Set([...calendar,...calendarDates].map(c=>c.service_id));
 if(stopIds.size!==stops.length||tripIds.size!==trips.length)throw new Error('Duplicate stop/trip IDs');
 for(const t of trips)if(!services.has(t.service_id))throw new Error(`Unknown service ${t.service_id}`);
 for(const s of stopTimes){if(!stopIds.has(s.stop_id))throw new Error(`Unknown stop ${s.stop_id}`);if(!tripIds.has(s.trip_id))throw new Error(`Unknown trip ${s.trip_id}`);}
 for(const t of transfers)if(!stopIds.has(t.from_stop_id)||!stopIds.has(t.to_stop_id))throw new Error('Unknown transfer stop');
 return {stops,trips,stopTimes,calendar,calendarDates,transfers};
}
export async function ingestGtfsZip(input:string=OFFICIAL_SUPPLEMENTED_GTFS){
 const directory=await mkdtemp(join(tmpdir(),'exitnow-gtfs-'));try{
 const isRemote=/^https?:/.test(input);let archive:string,bytes:Buffer;let lastModified:string|null=null;
 if(isRemote){if(input!==OFFICIAL_SUPPLEMENTED_GTFS)throw new Error('Only the verified official supplemented URL is accepted; use a local ZIP for other feeds');const response=await fetch(input,{signal:AbortSignal.timeout(60000),redirect:'error'});if(!response.ok)throw new Error(`GTFS download HTTP ${response.status}`);if(Number(response.headers.get('content-length'))>100*1024*1024)throw new Error('ZIP too large');bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100*1024*1024)throw new Error('ZIP too large');lastModified=response.headers.get('last-modified');archive=join(directory,'feed.zip');await writeFile(archive,bytes);}else{archive=resolve(input);bytes=await readFile(archive);if(bytes.length>100*1024*1024)throw new Error('ZIP too large');}
 const listing=await run('unzip',['-Z1',archive],{maxBuffer:4*1024*1024,timeout:30000});const entries=listing.stdout.trim().split(/\r?\n/);const files:Partial<Record<typeof names[number],string>>={};
 // Never extract files to disk: exact known names are streamed to stdout, avoiding zip traversal.
 for(const name of names){if(entries.filter(e=>e===name).length>1)throw new Error(`Duplicate ZIP entry ${name}`);if(entries.includes(name)){files[name]=(await run('unzip',['-p',archive,name],{maxBuffer:160*1024*1024,timeout:30000})).stdout;}}
 const tables=parseGtfsTables(files);return {source:{kind:isRemote?'official_supplemented_gtfs':'local_file',location:input,fetchedAt:new Date().toISOString(),lastModified,sha256:createHash('sha256').update(bytes).digest('hex')},tables};
 }finally{await rm(directory,{recursive:true,force:true});}
}
