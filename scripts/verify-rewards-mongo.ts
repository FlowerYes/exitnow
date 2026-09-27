/** Isolated database fixture: proves real Mongo transaction behavior, never touches live rewards or transfers tokens. */
import {MongoClient} from 'mongodb';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {MongoRewardsRepository,RewardsService,RewardsPayoutService,type PayoutAdapter} from '../packages/rewards/src/index.ts';
if(!process.env.MONGODB_URI)throw Error('MONGODB_URI required');
const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:5,serverSelectionTimeoutMS:5000});
const dbName=`exitnow_rewards_verification_${Date.now()}_${process.pid}`;
await client.connect();
try{
 const repo=new MongoRewardsRepository(client,dbName);await repo.initialize();const service=new RewardsService(repo,{allocatedFunding:1_000_000});const now=Date.now();
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>service.prepareReport({station:'fixture-station',asset:'fixture-elevator-'+i,category:'elevator_status',condition:'working',observedAt:now},{accountId:'fixture-'+i,groupId:'fixture-'+i})));
 const snapshot=await service.snapshot();assert.equal(snapshot.tasks.filter(t=>t.funded).length,1);assert.equal(snapshot.accounting.totalCommitted,1_000_000);
 const task=snapshot.tasks.find(t=>t.funded)!,slot=task.slots[0];const input={...task.target,condition:'working',observedAt:now,taskId:task.id};const report=await service.submitReport(input,{accountId:slot.accountId!,groupId:slot.groupId!});await service.review(report.report.id,{...input,kind:'moderator',decision:'accept',reviewerId:'fixture-reviewer',reference:'fixture:isolated-mongo-test',reason:'Synthetic verification only'});
 await repo.transact(async s=>{s.wallets[slot.accountId!]={accountId:slot.accountId!,address:'fixture-wallet',boundAt:now}});
 let signs=0;const adapter:PayoutAdapter={prepare:async()=>{signs++;return {signature:'fixture-not-on-chain',raw:'fixture',lastValidBlockHeight:1,feeLamports:1,setupLamports:0,destination:'fixture-ata',createsAta:false}},broadcast:async()=>{throw Error('simulated ambiguous RPC')},status:async()=> 'unknown'};
 const payout=new RewardsPayoutService(repo,adapter);const [one,two]=await Promise.all([payout.claim(slot.accountId!,slot.groupId!),payout.claim(slot.accountId!,slot.groupId!)]);assert.equal(one.id,two.id);await payout.process(one.id);
 const restarted=new RewardsPayoutService(new MongoRewardsRepository(client,dbName),adapter);await restarted.process(one.id);assert.equal(signs,1);const final=await service.snapshot();assert.equal(final.accounting.totalCommitted,1_000_000);assert.equal(final.payouts[0].status,'unknown');
 const evidence={mode:'isolated real MongoDB transactions with synthetic rewards and RPC adapter',concurrentAttempts:8,completedAttempts:results.filter(r=>r.status==='fulfilled').length,fundedTasks:1,committedUnits:final.accounting.totalCommitted,singlePayoutId:one.id,signCountAcrossRestart:signs,payoutStatus:'unknown',realSolanaTransfer:false,cleanup:'isolated verification collection removed'};
 await writeFile('artifacts/rewards-mongodb-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{await client.db(dbName).collection('rider_rewards_state').drop().catch(()=>{});await client.close()}
