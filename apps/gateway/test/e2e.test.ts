import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bridge} from '../src/service.ts';
import {ReplayStore} from '../src/store.ts';
test('replay ingress → scoped route tool → asynchronous completion → outbox',async()=>{
 const store=new ReplayStore();const sent:string[]=[];let bridge:Bridge;
 bridge=new Bridge(store,{async send(_t,_recipient,text){sent.push(text);}},async j=>{
  const route=await bridge.tool(j.id,j.token,'plan_route',{origin:'columbia',destination:'williamsburg',departureTime:'2026-09-26T22:00:00Z'}) as {recommended:{nextInstruction:string}};
  await bridge.tool(j.id,j.token,'complete_job',{text:route.recommended.nextInstruction});
 });
 const event={eventId:'e2e',tripId:'trip',sender:'private-rider',spaceId:'dm',text:'Take me to Williamsburg',timestamp:Date.now()};
 await bridge.receive(event);await bridge.receive(event);await bridge.tick();
 assert.equal(store.state.jobs.length,1);assert.equal(store.state.jobs[0].status,'completed');assert.equal(sent.length,2);assert.equal(store.state.outbox.every(n=>n.status==='sent'),true);
});
test('revoked recipient consent suppresses an already queued update',async()=>{
 const store=new ReplayStore();const sent:string[]=[];const bridge=new Bridge(store,{async send(_t,r){sent.push(r);}},async()=>{});
 await bridge.receive({eventId:'consent',tripId:'t',sender:'rider',spaceId:'dm',text:'Hello',timestamp:1});
 await store.transaction(s=>{s.trips.t.destination='williamsburg';s.trips.t.consents.friend={allowed:false,destination:'williamsburg',route:'private'};s.outbox.push({id:'recipient',tripId:'t',recipient:'friend',kind:'eta',eta:1,text:'ETA update',status:'pending'});});
 await bridge.tick();assert.equal(sent.includes('friend'),false);assert.equal(store.state.outbox.find(n=>n.id==='recipient')?.status,'suppressed');
});
test('new destination clears previously confirmed arrival',async()=>{const store=new ReplayStore();let bridge:Bridge;bridge=new Bridge(store,{async send(){}},async j=>{await bridge.tool(j.id,j.token,'plan_route',{origin:'columbia',destination:'queens',departureTime:'2026-09-26T22:00:00Z'});});await bridge.receive({eventId:'arrival',tripId:'t',sender:'rider',spaceId:'dm',text:'I arrived',timestamp:1});await store.transaction(s=>{s.trips.t.destination='williamsburg';});await bridge.tick();assert.equal(store.state.trips.t.arrived,false);});
test('a new same-destination plan clears previous journey arrival',async()=>{const store=new ReplayStore();let bridge:Bridge;bridge=new Bridge(store,{async send(){}},async j=>{await bridge.tool(j.id,j.token,'plan_route',{origin:'columbia',destination:'williamsburg',departureTime:'2026-09-27T22:00:00Z'});});await bridge.receive({eventId:'new-journey',tripId:'t',sender:'rider',spaceId:'dm',text:'Plan another journey',timestamp:1});await store.transaction(s=>{s.trips.t.destination='williamsburg';s.trips.t.arrived=true;s.trips.t.consents.friend={allowed:true,destination:'williamsburg',route:'private',arrivalSentDestination:'williamsburg'};});await bridge.tick();assert.equal(store.state.trips.t.arrived,false);assert.equal(store.state.trips.t.consents.friend.arrivalSentDestination,undefined);});
