import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAP_STATIONS, corridorStationIds, journeyConnections, parseMapGeometry} from '../src/map-data.ts';

test('map station references preserve official GTFS coordinates and identifiers',()=>{
 assert.equal(MAP_STATIONS.length,6);
 assert.deepEqual(MAP_STATIONS.find(s=>s.id==='williamsburg')?.position,[40.717304,-73.956872]);
 assert.equal(MAP_STATIONS.find(s=>s.id==='williamsburg')?.gtfsStopId,'L08');
 assert.ok(MAP_STATIONS.every(s=>s.position[0]>40&&s.position[0]<42&&s.position[1]<-73&&s.position[1]>-75));
});
test('official map shapes are static context with source provenance and actual points',()=>{
 const data=parseMapGeometry(JSON.parse(readFileSync(new URL('../../../apps/web/public/map-data.json',import.meta.url),'utf8')));
 assert.ok(data.source.startsWith('https://rrgtfsfeeds.s3.amazonaws.com/'));
 assert.ok(data.lines.find(l=>l.line==='G')!.coordinates.length>100);
 assert.ok(data.lines.find(l=>l.line==='L'));
 assert.equal(data.kind,'static_reference');
 assert.throws(()=>parseMapGeometry({source:'unknown',lines:[{line:'G',coordinates:[[NaN,0]]}]}));
});
test('synthetic corridors and itinerary links never masquerade as track geometry',()=>{
 assert.deepEqual(corridorStationIds('queens-brooklyn'),['queens','williamsburg','brooklyn']);
 assert.deepEqual(corridorStationIds('unknown'),[]);
 const links=journeyConnections([{from:'queens',to:'williamsburg',line:'G'}]);
 assert.equal(links[0].kind,'station_connection');
 assert.equal(links[0].approximate,true);
 assert.deepEqual(links[0].positions,[MAP_STATIONS[4].position,MAP_STATIONS[3].position]);
 assert.deepEqual(journeyConnections([{from:'unknown',to:'brooklyn',line:'G'}]),[]);
});
