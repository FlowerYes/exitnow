import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bridge} from '../src/service.ts';
import {ReplayStore} from '../src/store.ts';

const event={eventId:'first',tripId:'trip',sender:'rider',spaceId:'dm',text:'Plan my journey',timestamp:1};

test('dispatch failure informs the rider once without redispatching an uncertain job',async()=>{
 const store=new ReplayStore();const sent:string[]=[];let dispatches=0;
 const bridge=new Bridge(store,{async send(_t,_r,text){sent.push(text);}},async()=>{dispatches++;throw Error('connection lost');});
 await bridge.receive(event);await bridge.tick();await bridge.tick();
 assert.equal(dispatches,1);assert.equal(store.state.jobs[0].status,'failed');
 assert.equal(sent.filter(text=>text.includes('could not finish')).length,1);
 assert.ok(sent.some(text=>text.includes('send a new message')));
});

test('expired job informs the rider once and never dispatches',async()=>{
 const store=new ReplayStore();const sent:string[]=[];
 const bridge=new Bridge(store,{async send(_t,_r,text){sent.push(text);}},async()=>{assert.fail('expired job dispatched');});
 await bridge.receive(event);await store.transaction(s=>{s.jobs[0].expires=Date.now()-1;});
 await bridge.tick();await bridge.tick();
 assert.equal(store.state.jobs[0].status,'timed-out');
 assert.equal(sent.filter(text=>text.includes('timed out')).length,1);
});

test('superseded failures never send a stale failure notice',async()=>{
 const store=new ReplayStore();const sent:string[]=[];
 const bridge=new Bridge(store,{async send(_t,_r,text){sent.push(text);}},async()=>{});
 await bridge.receive(event);await bridge.receive({...event,eventId:'new',timestamp:2});await bridge.tick();
 assert.equal(sent.some(text=>/could not finish|timed out/.test(text)),false);
});

test('uncertain rider sends and persisted sending records are never blindly retried',async()=>{
 const store=new ReplayStore();let sends=0;
 const bridge=new Bridge(store,{async send(){sends++;throw Error('delivery unknown');}},async()=>{});
 await bridge.receive(event);await store.transaction(s=>{s.outbox.push({...s.outbox[0],id:'crash-before-commit',status:'sending'});});
 await bridge.tick();await bridge.tick();assert.equal(sends,1);
 assert.equal(store.state.outbox[0].status,'uncertain');assert.equal(store.state.outbox[1].status,'sending');
});

test('route completion prominently discloses synthetic directions even when the bot omits the warning',async()=>{
 const store=new ReplayStore();const sent:string[]=[];let bridge:Bridge;
 bridge=new Bridge(store,{async send(_t,_r,text){sent.push(text);}},async j=>{
  const result=await bridge.tool(j.id,j.token,'plan_route',{origin:'columbia',destination:'williamsburg',departureTime:'2026-09-26T22:00:00Z'}) as {recommended:{nextInstruction:string}};
  await bridge.tool(j.id,j.token,'complete_job',{text:result.recommended.nextInstruction});
 });
 await bridge.receive(event);await bridge.tick();
 assert.match(sent[1],/^Synthetic replay/);assert.match(sent[1],/not live travel guidance/);
});

test('blank completion remains invalid even when a replay warning would be added',async()=>{
 const store=new ReplayStore();let bridge:Bridge;
 bridge=new Bridge(store,{async send(){}},async j=>{
  await bridge.tool(j.id,j.token,'plan_route',{origin:'columbia',destination:'williamsburg',departureTime:'2026-09-26T22:00:00Z'});
  await assert.rejects(bridge.tool(j.id,j.token,'complete_job',{text:'   '}),/invalid result/);
 });
 await bridge.receive(event);await bridge.tick();assert.equal(store.state.jobs[0].status,'running');
});

test('failure notice delivery uncertainty does not retry the notice on later ticks',async()=>{
 const store=new ReplayStore();let notices=0;
 const bridge=new Bridge(store,{async send(_t,_r,text){if(text.includes('could not finish')){notices++;throw Error('unknown delivery');}}},async()=>{throw Error('dispatch failed');});
 await bridge.receive(event);await bridge.tick();await bridge.tick();
 assert.equal(notices,1);assert.equal(store.state.outbox.find(n=>n.id.startsWith('job-failure:'))?.status,'uncertain');
});

test('a full-length valid completion retains every character after adding provenance',async()=>{
 const store=new ReplayStore();const text='x'.repeat(3000);let bridge:Bridge;
 bridge=new Bridge(store,{async send(){}},async j=>{
  await bridge.tool(j.id,j.token,'plan_route',{origin:'columbia',destination:'williamsburg',departureTime:'2026-09-26T22:00:00Z'});
  await bridge.tool(j.id,j.token,'complete_job',{text});
 });
 await bridge.receive(event);await bridge.tick();assert.equal(store.state.jobs[0].status,'completed');
 assert.ok(store.state.outbox[1].text.endsWith(text));assert.match(store.state.outbox[1].text,/^Synthetic replay/);
});
