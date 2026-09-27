import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bridge} from '../src/service.ts';
import {ReplayStore} from '../src/store.ts';
import {claim} from '../src/state.ts';
import {observationInput, guidanceForTrip} from '../src/rewards.ts';

test('report extraction asks for essentials without inventing location/time',()=>{
 const value=observationInput({category:'elevator_status',condition:'not_working'});
 assert.deepEqual(value.missing,['station','observedAt','asset']);
 assert.equal(observationInput({station:'columbia',category:'platform_crowding',condition:'crowded',observedAt:Date.now()}).missing.includes('direction or platform'),true);
 assert.deepEqual(observationInput({station:'columbia',category:'elevator_status',asset:'EL-1',condition:'working',observedAt:Date.now()}).missing,[]);
});
test('fresh verified guidance is station scoped and stale reports never influence trips',()=>{
 const route={recommended:{legs:[{from:'columbia',to:'times-square',direction:'southbound'}]}};
 const now=Date.now();
 const reports=[{id:'fresh',station:'columbia',category:'platform_crowding',condition:'crowded',direction:'southbound',observedAt:now,liveUntil:now+1000,status:'verified'}, {id:'stale',station:'columbia',category:'platform_crowding',condition:'crowded',observedAt:now-2000,liveUntil:now-1,status:'verified'}, {id:'pending',station:'columbia',category:'platform_crowding',condition:'crowded',observedAt:now,liveUntil:now+1000,status:'pending'}, {id:'elsewhere',station:'queens',category:'platform_crowding',condition:'crowded',observedAt:now,liveUntil:now+1000,status:'verified'}];
 assert.deepEqual(guidanceForTrip(reports,route,now).map(x=>x.id),['fresh']);
});
test('Grok scoped token cannot authorize verification or payouts or removed purchases',async()=>{
 const store=new ReplayStore();const bridge=new Bridge(store,{async send(){}},async()=>{});
 await bridge.receive({eventId:'reward-auth',tripId:'t',sender:'real-rider',spaceId:'dm',text:'Report an elevator',timestamp:Date.now()});
 const job=await store.transaction(s=>claim(s)!);
 for(const tool of ['review_observation','authorize_payout','request_analysis_job'])await assert.rejects(()=>bridge.tool(job.id,job.token,tool,{accountId:'attacker'}),/unknown tool/);
});

import {RewardsService,MemoryRewardsRepository} from '../../../packages/rewards/src/index.ts';
import {eligible} from '../src/state.ts';
async function setupRewards(funding=10_000_000){
 const rewards=new RewardsService(new MemoryRewardsRepository(),{allocatedFunding:funding});
 const store=new ReplayStore();const bridge=new Bridge(store,{async send(){}},async()=>{},async()=>rewards);
 await bridge.receive({eventId:'reward-flow',tripId:'t',sender:'actual',spaceId:'dm',text:'The elevator is working',timestamp:Date.now()});
 const job=await store.transaction(s=>claim(s)!);
 return {store,bridge,rewards,job};
}
const observation=()=>({station:'columbia',category:'elevator_status',asset:'EL-1',condition:'working',observedAt:Date.now()});
test('walletless structured report reserves fixed amount and ignores model identity; duplicate earns no extra slot',async()=>{
 const {bridge,rewards,job}=await setupRewards();
 const quote=await bridge.tool(job.id,job.token,'prepare_observation',{...observation(),accountId:'forged',groupId:'forged'}) as {funded:boolean;provisionalAmount:number};
 assert.equal(quote.funded,true);assert.equal(quote.provisionalAmount,600_000);
 const received=await bridge.tool(job.id,job.token,'submit_observation',{accountId:'forged'}) as {report:{id:string};provisionalAmount:number};
 assert.equal(received.provisionalAmount,600_000);
 const duplicate=await bridge.tool(job.id,job.token,'submit_observation',{}) as {provisionalAmount:number};assert.equal(duplicate.provisionalAmount,0);
 const state=await rewards.snapshot();assert.equal(state.reports[0].accountId,'photon:actual');assert.equal(state.claimableBalance,0);assert.equal(state.tasks.length,1);
 assert.equal(state.tasks[0].slots.filter(s=>s.groupId).length,1);
});
test('unpaid contribution needs subsequent authenticated confirmation before submission',async()=>{
 const {bridge,store,job,rewards}=await setupRewards(0);
 const quote=await bridge.tool(job.id,job.token,'prepare_observation',observation()) as {funded:boolean};assert.equal(quote.funded,false);
 await assert.rejects(()=>bridge.tool(job.id,job.token,'submit_observation',{unpaidConfirmed:true}),/new rider message/);
 assert.equal((await rewards.snapshot()).reports.length,0);
 await bridge.tool(job.id,job.token,'complete_job',{text:'This is unpaid. Reply submit unpaid to contribute.'});
 await bridge.receive({eventId:'confirm',tripId:'t',sender:'actual',spaceId:'dm',text:'submit unpaid',timestamp:Date.now()+1});
 const next=await store.transaction(s=>claim(s)!);
 const result=await bridge.tool(next.id,next.token,'submit_observation',{}) as {provisionalAmount:number};assert.equal(result.provisionalAmount,0);
});
test('expired observation outbox warnings are suppressed; reward outage preserves navigation',async()=>{
 const {bridge,store}=await setupRewards();
 await store.transaction(s=>s.outbox.push({id:'stale-guidance',tripId:'t',recipient:'rider',kind:'rider',text:'stale',status:'pending',expiresAt:Date.now()-1}));
 assert.equal(eligible(store.state,store.state.outbox.at(-1)!),false);
 const routeBridge=new Bridge(new ReplayStore(),{async send(){}},async()=>{},async()=>{throw Error('database outage')});
 await routeBridge.receive({eventId:'navigate',tripId:'n',sender:'r',spaceId:'dm',text:'Navigate',timestamp:Date.now()});
 const job=await routeBridge.store.transaction(s=>claim(s)!);
 const route=await routeBridge.tool(job.id,job.token,'plan_route',{origin:'columbia',destination:'williamsburg',departureTime:'2026-09-26T22:00:00Z'}) as {recommended:unknown};assert.ok(route.recommended);
});

test('assigned blind check earns for verified normal operation and feeds affected trip guidance',async()=>{
 const {bridge,store,job,rewards}=await setupRewards();
 const original={...observation(),condition:'not_working'};
 await bridge.tool(job.id,job.token,'prepare_observation',original);
 const initial=await bridge.tool(job.id,job.token,'submit_observation',{}) as {report:{id:string}};
 await bridge.receive({eventId:'checker',tripId:'checker-trip',sender:'independent',spaceId:'checker-dm',text:'I am at Columbia. Can I help check something?',timestamp:Date.now()});
 await bridge.tool(job.id,job.token,'complete_job',{text:'Report pending verification.'});
 const checking=await store.transaction(s=>claim(s)!);
 const assignment=await bridge.tool(checking.id,checking.token,'request_independent_check',{station:'columbia'}) as {taskId:string;amount:number};
 assert.equal(assignment.amount,200_000);assert.equal(JSON.stringify(assignment).includes('not_working'),false);
 const normal={...observation(),taskId:assignment.taskId};
 await bridge.tool(checking.id,checking.token,'prepare_observation',normal);
 const checked=await bridge.tool(checking.id,checking.token,'submit_observation',{}) as {report:{id:string}};
 await rewards.review(initial.report.id,{...original,category:'elevator_status',kind:'moderator',reviewerId:'test-moderator',reference:'fixture:review-initial',decision:'reject',reason:'Labeled test review establishes initial report mistaken'});
 await rewards.review(checked.report.id,{...normal,category:'elevator_status',kind:'moderator',reviewerId:'test-moderator',reference:'fixture:review-check',decision:'accept',reason:'Labeled test evidence establishes elevator working'});
 assert.equal((await rewards.snapshot('photon:independent')).claimableBalance,200_000);
 const route=await bridge.tool(checking.id,checking.token,'plan_route',{origin:'columbia',destination:'williamsburg',departureTime:'2026-09-26T22:00:00Z'}) as {warnings:string[]};
 assert.equal(route.warnings.some(w=>w.includes('working')),true);
 assert.equal((await rewards.snapshot()).reports.find(r=>r.id===checked.report.id)?.guidanceChanged,true);
 // Only the live response receives the ephemeral warning; stored route cannot retain it after expiry.
 assert.equal(JSON.stringify(store.state.trips['checker-trip'].route).includes('Verified rider observation'),false);
});

test('expired funded preparation cannot silently submit unpaid; Bot status DTO excludes account identifiers and ledger internals',async()=>{
 const {bridge,store,job,rewards}=await setupRewards();
 await bridge.tool(job.id,job.token,'prepare_observation',observation());
 await store.transaction(s=>{s.trips.t.rewardDraft!.expiresAt=Date.now()-1;});
 await assert.rejects(()=>bridge.tool(job.id,job.token,'submit_observation',{}),/expired; prepare again/);
 assert.equal((await rewards.snapshot()).reports.length,0);
 const status=await bridge.tool(job.id,job.token,'get_reward_status',{}) as Record<string,unknown>;
 assert.equal('ledger' in status,false);assert.equal('tasks' in status,false);assert.equal(JSON.stringify(status).includes('photon:actual'),false);
});
test('known station names normalize to routing ids and direction synonyms preserve targeted guidance',()=>{
 const parsed=observationInput({...observation(),station:'116 St–Columbia University'});assert.equal(parsed.report.station,'columbia');
 const now=Date.now();const result=guidanceForTrip([{id:'same',station:'116 St–Columbia University',category:'platform_crowding',condition:'busy',direction:'downtown',observedAt:now,expiresAt:now+1000,verification:'moderator'}],{recommended:{legs:[{from:'columbia',to:'times-square',direction:'southbound'}]}},now);
 assert.equal(result.length,1);
});

test('guidance retracted after queueing is suppressed before Photon dispatch',async()=>{
 const rewards=new RewardsService(new MemoryRewardsRepository(),{allocatedFunding:1_000_000});
 const identity={accountId:'photon:actual',groupId:'photon:actual'};
 const input={...observation(),category:'elevator_status' as const};
 const submitted=await rewards.submitReport(input,identity);
 await rewards.review(submitted.report.id,{...input,kind:'moderator',reviewerId:'fixture-moderator',reference:'fixture:verified-elevator',decision:'accept',reason:'Simulated evidence for notification regression'});
 const store=new ReplayStore();const delivered:string[]=[];let bridge:Bridge;
 bridge=new Bridge(store,{async send(_trip,_recipient,text){delivered.push(text);}},async job=>{
  // The worker queued fresh guidance before dispatching this job; evidence changes before send.
  await rewards.dispute(submitted.report.id,identity,'New contradictory evidence; stop live guidance during review');
  await bridge.tool(job.id,job.token,'complete_job',{text:'We are reviewing this condition.'});
 },async()=>rewards);
 await bridge.receive({eventId:'retraction',tripId:'t',sender:'actual',spaceId:'dm',text:'Check my journey',timestamp:Date.now()});
 await store.transaction(s=>{s.trips.t.route={recommended:{legs:[{from:'columbia',to:'times-square',direction:'southbound'}]}};});
 await bridge.tick();
 assert.equal(store.state.outbox.find(n=>n.observationId===submitted.report.id)?.status,'suppressed');
 assert.equal(delivered.some(text=>text.includes('Verified rider observation')),false);
});

test('my rewards returns private access without dispatching an AI routine',async()=>{
 const old=process.env.REWARDS_SESSION_SECRET;process.env.REWARDS_SESSION_SECRET='test-only-rewards-secret-32-characters';
 try{
  const store=new ReplayStore();const sent:string[]=[];let dispatched=0;
  const bridge=new Bridge(store,{async send(_t,_r,text){sent.push(text)}},async()=>{dispatched++});
  await bridge.receive({eventId:'direct-rewards',tripId:'direct',sender:'actual',spaceId:'dm',text:'my rewards',timestamp:Date.now()});
  await bridge.tick();
  assert.equal(dispatched,0,'Rewards access must not depend on the AI routine');
  assert.ok(sent.some(text=>text.includes('Private access code:')));
  assert.equal(store.state.jobs[0].status,'completed');
 }finally{if(old===undefined)delete process.env.REWARDS_SESSION_SECRET;else process.env.REWARDS_SESSION_SECRET=old;}
});
