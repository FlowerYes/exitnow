import {randomUUID} from 'node:crypto';
import type {RewardsService} from '../../../packages/rewards/src/index.ts';
import {createRiderAccess,resolveRewardIdentity} from '../../../packages/rewards/src/auth.ts';
import {observationInput,guidanceForTrip,canonicalStation,type GuidanceObservation} from './rewards.ts';
import {planRoute,demoNetwork} from '../../../packages/core/src/index.ts';
import {authorize,claim,complete,eligible,ingest,type Inbound,type Job} from './state.ts';
import type {Store} from './store.ts';
import type {Messenger} from './providers.ts';
export class Bridge {
 constructor(readonly store:Store,readonly messenger:Messenger,readonly dispatch:(job:Job)=>Promise<void>,readonly rewards?:()=>Promise<RewardsService>){}
 private async liveReports():Promise<GuidanceObservation[]>{if(!this.rewards)return [];try{return await (await this.rewards()).liveObservations();}catch{return [];}}
 receive(e:Inbound){return this.store.transaction(s=>ingest(s,e));}
 async tick(){
 // Observations add scoped contextual warnings; they never assert an accessible route.
 if(this.rewards){const reports=await this.liveReports();await this.store.transaction(s=>{for(const t of Object.values(s.trips)){if(t.arrived||Date.now()-t.lastTimestamp>2*60*60_000)continue;for(const g of guidanceForTrip(reports,t.route)){const key=t.version+':'+g.id;if(t.guidanceIds?.includes(key))continue;(t.guidanceIds??=[]).push(key);s.outbox.push({id:randomUUID(),tripId:t.id,version:t.version,recipient:'rider',kind:'rider',observationId:g.id,expiresAt:g.liveUntil,text:g.message,status:'pending'});}}});}
 const j=await this.store.transaction(s=>claim(s));if(j){try{
 if(/^\s*(my rewards|rewards)[.!?]?\s*$/i.test(j.text)){
  await this.store.transaction(s=>{
   authorize(s,j.id,j.token);
   let text:string;
   try{const code=createRiderAccess('photon:'+s.trips[j.tripId].sender);text=`Private access code:\n${code}\n\nOpen ExitNow → Rewards, paste this code, then view your balance or select Report a problem. Valid for 15 minutes. No wallet needed to report. Test rewards require a funded assignment and verification.`;}
   catch{text='Rewards access is not configured yet. The operator needs to configure the shared rewards session secret. No access code was created.';}
   complete(s,j.id,j.token,text);
  });
 }else await this.dispatch(j);
}catch{await this.store.transaction(s=>{const job=s.jobs.find(x=>x.id===j.id)!;if(job?.status==='running'){job.status='failed';job.error='Provider dispatch failed or outcome uncertain; inspect routine history before retry';}});}}
 // A terminal routine must not leave the rider waiting at “checking”. A stable
 // outbox ID makes this safe across ticks/restarts, including uncertain sends.
 await this.store.transaction(s=>{
  for(const job of s.jobs){
   if(!['failed','timed-out'].includes(job.status)||s.trips[job.tripId]?.version!==job.version)continue;
   const id=`job-failure:${job.id}`;
   if(s.outbox.some(n=>n.id===id))continue;
   const reason=job.status==='timed-out'?'Your journey request timed out.':'I could not finish your journey request.';
   s.outbox.push({id,tripId:job.tripId,version:job.version,recipient:'rider',kind:'rider',text:`${reason} Please send a new message with your current station and destination to try again. I do not have updated directions for you.`,status:'pending'});
  }
 });
 // No automatic retries after an ambiguous transport failure: provider may have accepted it.
 const outgoing=await this.store.transaction(s=>{const ids=s.outbox.filter(x=>x.status==='pending').map(x=>x.id);for(const n of s.outbox)if(ids.includes(n.id))n.status='sending';return ids;});
 await this.store.transaction(async s=>{for(const n of s.outbox.filter(x=>outgoing.includes(x.id))){if(!eligible(s,n)){n.status='suppressed';continue;}if(n.observationId&&!guidanceForTrip(await this.liveReports(),s.trips[n.tripId].route).some(g=>g.id===n.observationId)){n.status='suppressed';continue;}n.status='sending';try{await this.messenger.send(s.trips[n.tripId],n.recipient,n.text);n.status='sent';if(n.observationId&&this.rewards){try{await (await this.rewards()).recordGuidance(n.observationId,n.tripId);}catch{/* Delivery succeeded; audit persistence failure must not trigger resend. */}}const c=s.trips[n.tripId].consents[n.recipient];if(c){if(n.kind==='arrival')c.arrivalSentDestination=s.trips[n.tripId].destination;c.lastSent=Date.now();c.lastEta=n.eta;c.lastIncident=n.incident;}}catch{n.status='uncertain';}}});}
 async tool(id:string,token:string,name:string,input:Record<string,unknown>){return this.store.transaction(async s=>{const j=authorize(s,id,token),t=s.trips[j.tripId];switch(name){
 case 'get_trip_state':return {version:t.version,arrived:t.arrived,destination:t.destination,route:t.route,analytics:t.analytics,riderGuidance:guidanceForTrip(await this.liveReports(),t.route),messageReceivedAt:j.created,messageSentAt:t.lastTimestamp,categories:['platform_crowding','boarding_difficulty','elevator_status','escalator_status','entrance_obstruction'],preparedObservation:t.rewardDraft};
 case 'resolve_destination':return {status:'confirmation_required',query:String(input.query??''),message:'Use a station identifier from the route dataset. Address geocoding is not connected.'};
 case 'plan_route':case 'propose_reroute':{if(typeof input.origin!=='string'||typeof input.destination!=='string'||typeof input.departureTime!=='string')throw Error('origin, destination and departureTime required');const result=planRoute({origin:input.origin,destination:input.destination,departureTime:input.departureTime,preferFewerTransfers:input.preferFewerTransfers===true,maxWalkMinutes:typeof input.maxWalkMinutes==='number'?input.maxWalkMinutes:undefined,requireAccessible:input.requireAccessible===true,blockedLines:Array.isArray(input.blockedLines)?input.blockedLines.filter((x):x is string=>typeof x==='string'):undefined},demoNetwork);t.route=structuredClone(result);if(this.rewards){const guidance=guidanceForTrip(await this.liveReports(),result);result.warnings.push(...guidance.map(g=>g.message));for(const g of guidance)await (await this.rewards()).recordGuidance(g.id,t.id);}if(t.destination!==input.destination||(name==='plan_route'&&t.arrived&&!/^i arrived[.!]?$/i.test(j.text.trim()))){t.arrived=false;for(const c of Object.values(t.consents))delete c.arrivalSentDestination;}t.destination=input.destination;return result;}
 case 'get_service_updates':return {mode:'replay',alerts:[],riderGuidance:this.rewards?guidanceForTrip(await this.liveReports(),t.route):[],warning:'Live MTA collector is not attached to this gateway route tool. Verified rider observations are separate contextual guidance.'};
 case 'confirm_progress':return {status:'confirmation_required',message:'Only an authenticated rider message can establish arrival or station progress; do not infer it.'};
 case 'propose_notification':{const recipient=String(input.recipient??'');if(!t.consents[recipient]?.allowed)throw Error('recipient consent required');const kind:'arrival'|'eta'=input.kind==='arrival'?'arrival':'eta';const n={id:randomUUID(),tripId:t.id,version:t.version,recipient,kind,text:String(input.text??'').slice(0,1500),eta:typeof input.eta==='number'?input.eta:undefined,incident:typeof input.incident==='string'?input.incident:undefined,status:'pending' as const};if(!eligible(s,n))throw Error('notification ineligible');s.outbox.push(n);return {queued:true};}
 case 'prepare_observation':{
  const parsed=observationInput(input);if(parsed.missing.length)return {status:'clarification_required',missing:parsed.missing};
  if(!this.rewards)throw Error('Rider Rewards unavailable; navigation remains available');
  const result=await (await this.rewards()).prepareReport(parsed.report,resolveRewardIdentity('photon:'+t.sender));
  t.rewardDraft={input:parsed.report,preparedJobId:j.id,taskId:result.taskId,expiresAt:result.expiresAt,funded:result.funded,provisionalAmount:result.provisionalAmount};
  return {...result,status:'prepared',network:'devnet',currency:'test USDC',tokenDecimals:6,message:result.funded?`You could earn ${(result.provisionalAmount/1_000_000).toFixed(2)} test USDC if this report passes verification. This is pending, not earned.`:'This report is unpaid. Reply “submit unpaid” if you want to contribute it.'};
 }
 case 'submit_observation':{
  if(!this.rewards)throw Error('Rider Rewards unavailable');const draft=t.rewardDraft;
  if(!draft)throw Error('Prepare the observation and disclose its reward before submission');
  if(draft.submittedReportId)return {status:'duplicate',report:{id:draft.submittedReportId},provisionalAmount:0,message:'This submission was already received; it creates no extra reward.'};
  if(draft.funded&&draft.expiresAt!==undefined&&draft.expiresAt<=Date.now())throw Error('Provisional reward expired; prepare again and disclose the new amount before submitting');
  if(!draft.funded&&(draft.preparedJobId===j.id||!/^\s*(submit unpaid|yes[,.! ]*submit unpaid)[.!]?\s*$/i.test(j.text)))throw Error('Disclose unpaid status, then wait for a new rider message saying submit unpaid');
  const result=await (await this.rewards()).submitReport({...draft.input,taskId:draft.taskId},resolveRewardIdentity('photon:'+t.sender),draft.funded?{requireFunded:true,requireProvisionalAmount:draft.provisionalAmount}:{});
  draft.submittedReportId=result.report.id;
  return {report:{id:result.report.id,status:result.report.status,verificationStatus:result.report.verificationStatus,rewardStatus:result.report.rewardStatus},taskId:result.task?.id,provisionalAmount:result.provisionalAmount,reason:result.reason,network:'devnet',currency:'test USDC',tokenDecimals:6,message:'Report received. Verification is pending; no reward has been earned yet.'};
 }
 case 'request_independent_check':{
  if(!this.rewards)throw Error('Rider Rewards unavailable');if(typeof input.station!=='string'||!input.station.trim())throw Error('Confirmed current station required');
  const result=await (await this.rewards()).assignCheckAt(canonicalStation(input.station),resolveRewardIdentity('photon:'+t.sender));
  return {...result,warning:'Check only if you are already passing through this station. Do not make a special trip, enter restricted areas, or photograph strangers.'};
 }
 case 'get_reward_status':{
  if(!this.rewards)throw Error('Rider Rewards unavailable');const identity=resolveRewardIdentity('photon:'+t.sender);let webAccessToken:string|undefined;try{webAccessToken=createRiderAccess(identity.accountId);}catch{}
  const snapshot=await (await this.rewards()).snapshot(identity.groupId,identity.accountId);
  return {reports:snapshot.reports.map(r=>({id:r.id,station:r.station,category:r.category,condition:r.condition,observedAt:r.observedAt,receivedAt:r.receivedAt,status:r.status,verificationStatus:r.verificationStatus,rewardStatus:r.rewardStatus,provisionalAmount:r.provisionalAmount,reasons:r.audit.map(a=>({at:a.at,action:a.action,reason:a.reason})),calculation:snapshot.tasks.find(task=>task.id===r.taskId)?.calculation})),earnedBalance:snapshot.earnedBalance,claimableBalance:snapshot.claimableBalance,payouts:snapshot.payouts.map(p=>({id:p.id,status:p.status,amount:p.amount,createdAt:p.createdAt,receipt:p.receipt})),network:'devnet',currency:'test USDC',tokenDecimals:6,webPath:'/rewards',webAccessToken,tokenInstruction:webAccessToken?'Private rider-only token; paste into Rider Rewards within 15 minutes. Never put it in a URL.':undefined};
 }
 case 'complete_job':{
  const text=String(input.text??'');
  if(!text.trim()||text.length>3000)throw Error('invalid result');
  // The gateway owns evidence disclosure; a bot-written summary cannot turn
  // the replay route into a live estimate by omitting its provenance.
  const route=t.route as {freshness?:{mode?:string}}|undefined;
  const warning=route?.freshness?.mode==='replay'?'Synthetic replay — not live travel guidance. Times and directions are demo assumptions.\n\n':'';
  complete(s,id,token,text);
  if(warning)s.outbox[s.outbox.length-1].text=warning+text;
  return {accepted:true};
 }
 default:throw Error('unknown tool');}});}
}
