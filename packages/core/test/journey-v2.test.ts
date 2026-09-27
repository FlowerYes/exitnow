import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyStations, planDemoJourney} from '../src/journey-v2.ts';
const now = new Date('2026-09-27T12:00:00Z');
test('demo connects four boroughs with distinct, coherent, explicitly synthetic routes', () => {
 assert.ok(journeyStations.length >= 20);
 assert.ok(new Set(journeyStations.map(s => s.borough)).size >= 4);
 const result = planDemoJourney({origin:'columbia', destination:'brooklyn', now});
 assert.equal(result.source,'demo');
 assert.ok(result.warnings.some(w=>/synthetic/i.test(w)));
 assert.ok(result.routes.length >= 2);
 assert.equal(new Set(result.routes.map(r=>r.steps.map(s=>`${s.line}:${s.from}:${s.to}`).join('|'))).size,result.routes.length);
 for(const r of result.routes){
  assert.equal(Date.parse(r.arrivalTime)-Date.parse(r.departureTime),r.durationMinutes*60000);
  assert.ok(r.path.length>2);
  assert.ok(r.steps.every(s=>s.minutes>0));
 }
 assert.deepEqual(result,planDemoJourney({origin:'columbia',destination:'brooklyn',now}));
});

test('Google preserves supplied transit times and geometry, requests transit alternatives, and never invents crowding', async()=>{
 const {fetchGoogleJourneys}=await import('../src/journey-v2.ts');
 const result=await fetchGoogleJourneys({origin:'columbia',destination:'times-square',now,apiKey:'test-secret',preferFewerTransfers:true,fetcher:async(url,init)=>{
  assert.equal(url,'https://routes.googleapis.com/directions/v2:computeRoutes');
  const body=JSON.parse(String(init?.body));assert.equal(body.travelMode,'TRANSIT');assert.equal(body.computeAlternativeRoutes,true);assert.equal(body.transitPreferences.routingPreference,'FEWER_TRANSFERS');
  assert.ok(new Headers(init?.headers).get('X-Goog-FieldMask')?.includes('transitDetails'));
  return Response.json({routes:[{duration:'840s',distanceMeters:6500,polyline:{encodedPolyline:'_p~iF~ps|U_ulLnnqC'},legs:[{steps:[{travelMode:'TRANSIT',staticDuration:'600s',polyline:{encodedPolyline:'_p~iF~ps|U_ulLnnqC'},transitDetails:{stopDetails:{departureStop:{name:'116 St'},arrivalStop:{name:'Times Sq'},departureTime:'2026-09-27T12:04:00Z',arrivalTime:'2026-09-27T12:14:00Z'},transitLine:{nameShort:'1',color:'#EE352E'}}}]}]}]});
 }});
 assert.equal(result.source,'google');assert.equal(result.routes[0].crowding,'unknown');
 assert.equal(result.routes[0].arrivalTime,'2026-09-27T12:14:00.000Z');
 assert.equal(result.routes[0].steps[0].departureTime,'2026-09-27T12:04:00.000Z');
 assert.deepEqual(result.routes[0].path,[[38.5,-120.2],[40.7,-120.95]]);
 assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('invalid endpoints fail before calling Google and missing keys never fall back to fake live data',async()=>{
 const {fetchGoogleJourneys}=await import('../src/journey-v2.ts');
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;return Response.json({});};
 for(const pair of [{origin:'',destination:'queens'},{origin:'queens',destination:'queens'}]){
  assert.throws(()=>planDemoJourney({...pair,now}));
  await assert.rejects(fetchGoogleJourneys({...pair,apiKey:'key',fetcher,now}));
 }
 await assert.rejects(fetchGoogleJourneys({origin:'columbia',destination:'queens',apiKey:'',fetcher,now}),/not configured/);
 assert.equal(calls,0);
});
test('Google empty, malformed, upstream and timeout failures stay explicit and redact secrets',async()=>{
 const {fetchGoogleJourneys}=await import('../src/journey-v2.ts');
 const request={origin:'columbia',destination:'queens',now,apiKey:'secret'};
 for(const payload of [{},{routes:[]},{routes:[{duration:'NaNs'}]}])await assert.rejects(fetchGoogleJourneys({...request,fetcher:async()=>Response.json(payload)}));
 await assert.rejects(fetchGoogleJourneys({...request,fetcher:async()=>new Response('secret',{status:403})}),error=>error instanceof Error&&!error.message.includes('secret'));
 await assert.rejects(fetchGoogleJourneys({...request,fetcher:async()=>new Response('not-json')}),/could not be read/);
 await assert.rejects(fetchGoogleJourneys({...request,timeoutMs:5,fetcher:async()=>new Promise(()=>{})}),/timed out/);
});
test('all catalog destinations are reachable and rush-hour congestion changes estimates',()=>{
 for(const destination of journeyStations.filter(s=>s.id!=='columbia'))assert.ok(planDemoJourney({origin:'columbia',destination:destination.id,now}).routes.length);
 const offPeak=planDemoJourney({origin:'flushing',destination:'times-square',now:new Date('2026-09-27T16:00:00Z')});
 const rush=planDemoJourney({origin:'flushing',destination:'times-square',now:new Date('2026-09-27T21:00:00Z')});
 assert.ok(rush.routes[0].durationMinutes>offPeak.routes[0].durationMinutes);
 assert.equal(rush.routes.find(r=>r.title==='7')?.crowding,'high');
 assert.equal(rush.routes[0].crowding,'moderate');
});

test('HTTP catalog exposes capability flags, while demo and invalid requests return honest states',async()=>{
 const {GET,POST}=await import('../../../apps/web/app/api/journeys/route.ts');
 const catalog=await (await GET()).json();assert.equal(catalog.stations.length,25);assert.equal(typeof catalog.googleConfigured,'boolean');assert.equal(typeof catalog.browserMapsConfigured,'boolean');
 const post=(body:unknown)=>POST(new Request('http://localhost/api/journeys',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await post({origin:'columbia',destination:'columbia',mode:'demo',preferFewerTransfers:false})).status,400);
 assert.equal((await post({origin:'columbia',destination:'brooklyn',mode:'invalid',preferFewerTransfers:false})).status,400);
 const response=await post({origin:'columbia',destination:'brooklyn',mode:'demo',preferFewerTransfers:false});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.equal(result.source,'demo');assert.ok(result.routes[0].path.length>10);
});

test('demo crowding follows the ridden services rather than assigning one label to every route',()=>{
 const offPeak=planDemoJourney({origin:'queens',destination:'brooklyn',now:new Date('2026-09-27T16:00:00Z')});
 const rush=planDemoJourney({origin:'queens',destination:'brooklyn',now:new Date('2026-09-27T21:00:00Z')});
 assert.equal(offPeak.routes.find(r=>r.title==='G')?.crowding,'low');
 assert.equal(rush.routes.find(r=>r.title==='G')?.crowding,'moderate');
 assert.ok(rush.routes.some(r=>r.crowding==='moderate'));
});
test('equal-duration alternatives with the same service sequence appear only once',()=>{
 for(const hour of ['12','16','21']){
  const result=planDemoJourney({origin:'astoria-ditmars',destination:'coney-island',now:new Date(`2026-09-27T${hour}:00:00Z`)});
  const choices=result.routes.map(r=>`${r.title}:${r.durationMinutes}`);
  assert.equal(new Set(choices).size,choices.length);
  assert.ok(result.routes.length>=2);
 }
});

test('Google walking groups use adjacent transit stop names and preserve individual walk segments',async()=>{
 const {fetchGoogleJourneys}=await import('../src/journey-v2.ts');
 const polyline={encodedPolyline:'_p~iF~ps|U_ulLnnqC'};
 const walk={travelMode:'WALK',staticDuration:'60s',polyline};
 const transit={travelMode:'TRANSIT',staticDuration:'600s',polyline,transitDetails:{stopDetails:{departureStop:{name:'116 St entrance'},arrivalStop:{name:'Times Sq platform'},departureTime:'2026-09-27T12:04:00Z',arrivalTime:'2026-09-27T12:14:00Z'},transitLine:{nameShort:'1'}}};
 const result=await fetchGoogleJourneys({origin:'columbia',destination:'times-square',now,apiKey:'test',fetcher:async()=>Response.json({routes:[{duration:'900s',distanceMeters:6500,polyline,legs:[{steps:[walk,walk,transit,walk]}]}]})});
 const steps=result.routes[0].steps;
 assert.equal(steps[0].from,'116 St–Columbia University');
 assert.equal(steps[1].to,'116 St entrance');
 assert.equal(steps[3].from,'Times Sq platform');
 assert.equal(steps[3].to,'Times Sq–42 St');
 assert.equal(steps.length,4);assert.equal(result.routes[0].walkingMinutes,3);
});

test('demo crowding override changes estimates without moving the departure clock',()=>{
 const request={origin:'flushing',destination:'times-square',now:new Date('2026-09-27T16:00:00Z')};
 const typical=planDemoJourney({...request,peakOverride:false});
 const rush=planDemoJourney({...request,peakOverride:true});
 assert.equal(typical.generatedAt,rush.generatedAt);
 assert.equal(typical.routes[0].departureTime,rush.routes[0].departureTime);
 assert.ok(rush.routes[0].durationMinutes>typical.routes[0].durationMinutes);
 assert.equal(typical.routes.find(r=>r.title==='7')?.crowding,'moderate');
 assert.equal(rush.routes.find(r=>r.title==='7')?.crowding,'high');
});
test('HTTP demo crowding control accepts only supported scenarios',async()=>{
 const {POST}=await import('../../../apps/web/app/api/journeys/route.ts');
 const post=(demoCrowding:string)=>POST(new Request('http://localhost/api/journeys',{method:'POST',body:JSON.stringify({origin:'flushing',destination:'times-square',mode:'demo',demoCrowding})}));
 const typical=await post('typical'),rush=await post('rush-hour');
 assert.equal(typical.status,200);assert.equal(rush.status,200);
 const a=await typical.json(),b=await rush.json();
 assert.ok(b.routes[0].durationMinutes>a.routes[0].durationMinutes);
 assert.equal((await post('made-up')).status,400);
});

test('Google accepts arbitrary addresses, resolves endpoints and includes final walking in ETA',async()=>{
 const {fetchGoogleJourneys}=await import('../src/journey-v2.ts');
 const polyline={encodedPolyline:'_p~iF~ps|U_ulLnnqC'};
 const result=await fetchGoogleJourneys({origin:'Columbia University, New York, NY',destination:'Empire State Building, New York, NY',now,apiKey:'test',fetcher:async(_url,init)=>{
  const request=JSON.parse(String(init?.body));assert.deepEqual(request.origin,{address:'Columbia University, New York, NY'});assert.deepEqual(request.destination,{address:'Empire State Building, New York, NY'});
  assert.equal(request.regionCode,'us');assert.equal(request.transitPreferences?.allowedTravelModes,undefined);
  return Response.json({routes:[{duration:'900s',distanceMeters:6500,polyline,legs:[{startLocation:{latLng:{latitude:40.807,longitude:-73.964}},endLocation:{latLng:{latitude:40.748,longitude:-73.986}},steps:[{travelMode:'TRANSIT',staticDuration:'600s',polyline,transitDetails:{stopDetails:{departureStop:{name:'116 St'},arrivalStop:{name:'34 St'},departureTime:'2026-09-27T12:04:00Z',arrivalTime:'2026-09-27T12:14:00Z'},transitLine:{nameShort:'1'}}},{travelMode:'WALK',staticDuration:'60s',polyline:{encodedPolyline:'witwFn{vaM'}}]}]}]});
 }});
 assert.equal(result.origin.lat,40.807);assert.equal(result.destination.lng,-73.986);assert.equal(result.destination.name,'Empire State Building, New York, NY');assert.equal(result.routes[0].arrivalTime,'2026-09-27T12:15:00.000Z');
});

test('places search uses server credentials, NYC bias, redacts errors and validates requests',async()=>{
 const {GET}=await import('../../../apps/web/app/api/places/route.ts');
 const originalFetch=globalThis.fetch,originalKey=process.env.GOOGLE_MAPS_API_KEY;
 process.env.GOOGLE_MAPS_API_KEY='server-secret';
 try{
  globalThis.fetch=async(url,init)=>{
   assert.equal(url,'https://places.googleapis.com/v1/places:searchText');assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'),'server-secret');
   const body=JSON.parse(String(init?.body));assert.equal(body.textQuery,'Empire State Building');assert.equal(body.locationBias.circle.center.latitude,40.75);assert.equal(body.locationRestriction,undefined);
   return Response.json({places:[{id:'place-id',displayName:{text:'Empire State Building'},formattedAddress:'20 W 34th St, New York, NY',location:{latitude:40.748,longitude:-73.986}}]});
  };
  const response=await GET(new Request('http://localhost/api/places?q=Empire%20State%20Building'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual((await response.json()).places,[{id:'place-id',name:'Empire State Building',address:'20 W 34th St, New York, NY',lat:40.748,lng:-73.986}]);
  assert.equal((await GET(new Request('http://localhost/api/places?q=x'))).status,400);
  globalThis.fetch=async()=>new Response('server-secret',{status:403});const failed=await GET(new Request('http://localhost/api/places?q=Empire'));assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('server-secret'));
 }finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.GOOGLE_MAPS_API_KEY;else process.env.GOOGLE_MAPS_API_KEY=originalKey;}
});

test('Google permits a walking-only itinerary for nearby addresses',async()=>{
 const {fetchGoogleJourneys}=await import('../src/journey-v2.ts');const polyline={encodedPolyline:'_p~iF~ps|U_ulLnnqC'};
 const result=await fetchGoogleJourneys({origin:'columbia',destination:'times-square',now,apiKey:'test',fetcher:async()=>Response.json({routes:[{duration:'60s',distanceMeters:80,polyline,legs:[{steps:[{travelMode:'WALK',staticDuration:'60s',polyline}]}]}]})});
 assert.equal(result.routes[0].title,'Walk');assert.equal(result.routes[0].transfers,0);assert.equal(result.routes[0].arrivalTime,'2026-09-27T12:01:00.000Z');
});
