import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,parseGtfsTables,ingestGtfsZip} from '../src/ingest.ts';
import {decodeRealtime,RealtimeCollector,encodeRealtimeFixture} from '../src/realtime.ts';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const files={
 'stops.txt':'stop_id,stop_name,wheelchair_boarding\na,"Station, A",1\nb,Station B,0\n',
 'trips.txt':'route_id,service_id,trip_id,direction_id\nR,daily,t,1\n',
 'stop_times.txt':'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,25:00:00,25:00:00,a,1\nt,25:10:00,25:10:00,b,2\n',
 'calendar_dates.txt':'service_id,date,exception_type\ndaily,20260926,1\n',
 'transfers.txt':'from_stop_id,to_stop_id,transfer_type,min_transfer_time\na,b,2,180\n'
};
test('CSV handles quotes, embedded commas, newlines and escaped quotes',()=>{assert.deepEqual(parseCsv('id,name\n1,"A, \"\"B\"\"\nC"\n'),[{id:'1',name:'A, "B"\nC'}]);assert.throws(()=>parseCsv('id,name\n1,"bad'),/quote/);});
test('GTFS handles calendar_dates-only service and validates referential integrity',()=>{const t=parseGtfsTables(files);assert.equal(t.stops[0].stop_name,'Station, A');assert.equal(t.calendar.length,0);assert.equal(t.calendarDates[0].exception_type,1);assert.equal(t.transfers[0].min_transfer_time,180);assert.throws(()=>parseGtfsTables({...files,'stop_times.txt':files['stop_times.txt'].replace(',b,2',',missing,2')}),/Unknown stop/);});
test('ZIP reads only whitelisted root entries and records SHA256',async()=>{const dir=await mkdtemp(join(tmpdir(),'exitnow-gtfs-test-'));try{for(const [name,text]of Object.entries(files))await writeFile(join(dir,name),text);execFileSync('zip',['-q',join(dir,'fixture.zip'),...Object.keys(files)],{cwd:dir});const result=await ingestGtfsZip(join(dir,'fixture.zip'));assert.equal(result.tables.stopTimes.length,2);assert.match(result.source.sha256,/^[a-f0-9]{64}$/);assert.equal(result.source.kind,'local_file');}finally{await rm(dir,{recursive:true,force:true});}});
test('RT decoding preserves source time and trip prediction, missing timestamp remains unknown',async()=>{const bytes=await encodeRealtimeFixture({header:{gtfsRealtimeVersion:'2.0',timestamp:1000},entity:[{id:'trip',tripUpdate:{trip:{tripId:'t',routeId:'R'},stopTimeUpdate:[{stopId:'a',arrival:{time:1100,uncertainty:20}}]}}]});const feed=await decodeRealtime(bytes,1010000);assert.equal(feed.sourceTimestamp,1000000);assert.equal(feed.stale,false);assert.equal(feed.entities[0].tripUpdate!.stopTimeUpdate![0].arrival!.time,'1100');const noTime=await decodeRealtime(await encodeRealtimeFixture({header:{gtfsRealtimeVersion:'2.0'},entity:[]}),1010000);assert.equal(noTime.sourceTimestamp,null);assert.equal(noTime.stale,true);});
test('shared collector coalesces, backs off failures, retains actual source timestamp',async()=>{let calls=0;let fail=false;const bytes=await encodeRealtimeFixture({header:{gtfsRealtimeVersion:'2.0',timestamp:1000},entity:[]});const collector=new RealtimeCollector({fetcher:async()=>{calls++;if(fail)throw new Error('provider down');return new Response(Uint8Array.from(bytes).buffer);}});const a=await Promise.all([collector.collect('https://example.invalid/feed',1001000),collector.collect('https://example.invalid/feed',1001000)]);assert.equal(calls,1);assert.equal(a[0].sourceTimestamp,1000000);fail=true;const b=await collector.collect('https://example.invalid/feed',1040000);assert.equal(b.stale,true);assert.equal(b.sourceTimestamp,1000000);await collector.collect('https://example.invalid/feed',1040001);assert.equal(calls,2);});
