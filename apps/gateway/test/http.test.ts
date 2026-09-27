import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileReplayStore} from '../src/store.ts';
import {createReplayBridge,createGatewayServer} from '../src/http.ts';
test('HTTP replay persists a completed deterministic itinerary without exposing tokens',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'exitnow-http-'));const path=join(dir,'state.json');const store=new FileReplayStore(path);await store.load();const bridge=createReplayBridge(store);const server=createGatewayServer(bridge,true);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 try {const response=await fetch(`${base}/replay/messages`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventId:'http-event',text:'Get me to Williamsburg',origin:'columbia',destination:'williamsburg',departureTime:'2026-09-26T22:00:00Z'})});assert.equal(response.status,202);await bridge.tick();const view=await(await fetch(`${base}/replay/state`)).json();assert.equal(view.jobs[0].status,'completed');assert.equal(view.jobs[0].token,undefined);assert.equal(view.trips[0].route.freshness.mode,'replay');assert.ok(view.outbox.some((x:{text:string})=>x.text.includes('Replay')));const reopened=new FileReplayStore(path);await reopened.load();assert.equal(reopened.state.jobs[0].status,'completed');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
