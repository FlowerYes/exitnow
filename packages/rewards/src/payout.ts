import {randomUUID} from 'node:crypto';
import type {RewardsRepository} from './repository.js';
export type PayoutStatus='created'|'signed'|'submitted'|'confirmed'|'finalized'|'failed'|'unknown';
export interface SignedPayout {signature:string;raw:string;lastValidBlockHeight:number;feeLamports:number;setupLamports:number;destination:string;createsAta:boolean}
export interface PayoutRecord {id:string;accountId:string;groupId:string;recipient:string;amount:number;status:PayoutStatus;createdAt:number;updatedAt:number;feeReservedLamports:number;signed?:SignedPayout;submittedAt?:number;error?:string;history:{status:PayoutStatus;at:number}[]}
export interface PayoutAdapter {prepare(request:{recipient:string;amount:number;allowAccountSetup:boolean}):Promise<SignedPayout>;broadcast(tx:SignedPayout):Promise<void>;status(tx:SignedPayout,request:{recipient:string;amount:number}):Promise<'confirmed'|'finalized'|'failed'|'unknown'>}
export interface PayoutConfirmation {expectedAmount:number;expectedWallet:string}
export interface PayoutConfig {thresholdUnits:number;feeBudgetLamports:number;maxFeePerPayoutLamports:number;maxAccountSetupsPerGroup:number}
const defaults:PayoutConfig={thresholdUnits:100_000,feeBudgetLamports:10_000_000,maxFeePerPayoutLamports:2_100_000,maxAccountSetupsPerGroup:1};
function transition(p:PayoutRecord,status:PayoutStatus){p.status=status;p.updatedAt=Date.now();p.history.push({status,at:p.updatedAt})}
/** Every signing decision holds the authoritative database lock. Broadcast occurs only after signed bytes commit. */
export class RewardsPayoutService {
 readonly config:PayoutConfig;
 constructor(private repo:RewardsRepository,private adapter:PayoutAdapter,config:Partial<PayoutConfig>={}){this.config={...defaults,...config};for(const v of Object.values(this.config))if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid payout configuration');if(this.config.thresholdUnits<1)throw Error('Payout threshold must be positive')}
 async claim(accountId:string,groupId:string,confirmation?:PayoutConfirmation){return this.repo.transact(async state=>{const confirm=(amount:number,wallet:string)=>{if(confirmation&&(!Number.isSafeInteger(confirmation.expectedAmount)||confirmation.expectedAmount<1||confirmation.expectedAmount!==amount||confirmation.expectedWallet!==wallet))throw Error('Payout amount or wallet changed. Refresh your rewards and confirm again.')};const pending=Object.values(state.payouts).find(p=>p.accountId===accountId&&!['failed','finalized'].includes(p.status));if(pending){confirm(pending.amount,pending.recipient);return pending}const wallet=state.wallets[accountId];if(!wallet)throw Error('Connect and sign with a payout wallet first');const credits=Object.values(state.ledger).filter(c=>c.accountId===accountId&&c.groupId===groupId&&c.status==='payable');const amount=credits.reduce((sum,c)=>sum+c.amount,0);confirm(amount,wallet.address);if(amount<this.config.thresholdUnits)throw Error(`Claimable balance below payout threshold (${this.config.thresholdUnits} base units)`);if(state.feeSpentLamports+state.feeReservedLamports+this.config.maxFeePerPayoutLamports>this.config.feeBudgetLamports)throw Error('SOL fee budget exhausted');const id=randomUUID(),now=Date.now();const p:PayoutRecord={id,accountId,groupId,recipient:wallet.address,amount,status:'created',createdAt:now,updatedAt:now,feeReservedLamports:this.config.maxFeePerPayoutLamports,history:[{status:'created',at:now}]};state.payouts[id]=p;state.feeReservedLamports+=p.feeReservedLamports;for(const c of credits){c.status='reserved';c.payoutId=id}return p})}
 async cancelUnsigned(id:string,accountId:string){
  return this.repo.transact(async state=>{
   const p=state.payouts[id];
   if(!p||p.accountId!==accountId)throw Error('Unknown payout');
   // A durable signature might already be on chain, regardless of the latest RPC response.
   if(p.status!=='created'||p.signed)throw Error('Only an unsigned created payout can be cancelled');
   for(const credit of Object.values(state.ledger).filter(c=>c.payoutId===id)){
    if(credit.status!=='reserved')throw Error('Payout credit reservation is inconsistent');
    credit.status='payable';delete credit.payoutId;
   }
   state.feeReservedLamports-=p.feeReservedLamports;
   p.error='Unsigned payout cancelled; earned balance remains claimable';
   transition(p,'failed');
   return p;
  });
 }
 async process(id:string){
  // prepare may query RPC and sign, but MUST NOT submit. An interrupted commit never broadcasts unpersisted bytes.
  let payout=await this.repo.transact(async state=>{const p=state.payouts[id];if(!p)throw Error('Unknown payout');if(p.status==='created'){const setups=Object.values(state.payouts).filter(other=>other.groupId===p.groupId&&other.signed?.createsAta).length;const signed=await this.adapter.prepare({recipient:p.recipient,amount:p.amount,allowAccountSetup:setups<this.config.maxAccountSetupsPerGroup});if(signed.feeLamports+signed.setupLamports>p.feeReservedLamports)throw Error('Payout exceeds reserved SOL fee budget');p.signed=signed;transition(p,'signed')}return p});
  if(['finalized','failed'].includes(payout.status))return payout;
  const tx=payout.signed;if(!tx)throw Error('Payout missing durable transaction');
  let status:Awaited<ReturnType<PayoutAdapter['status']>>='unknown';try{status=await this.adapter.status(tx,payout)}catch{/* RPC uncertainty preserves the payable reservation. */}
  if(status==='unknown'&&payout.status!=='confirmed'){
   // Re-sending identical bytes is safe even after a crash between send and acknowledgement.
   try{await this.adapter.broadcast(tx);payout=await this.repo.transact(async state=>{const p=state.payouts[id];if(!['finalized','failed','confirmed'].includes(p.status)){p.submittedAt??=Date.now();transition(p,'submitted')}return p})}catch{payout=await this.repo.transact(async state=>{const p=state.payouts[id];if(!['finalized','failed','confirmed'].includes(p.status)){p.error='RPC submission uncertain; reconciling original signature';transition(p,'unknown')}return p})}
   return payout;
  }
  return this.repo.transact(async state=>{const p=state.payouts[id];if(['finalized','failed'].includes(p.status))return p;if(status==='unknown')return p;p.submittedAt??=Date.now();if(status==='confirmed'){transition(p,'confirmed');return p}transition(p,status);state.feeReservedLamports-=p.feeReservedLamports;state.feeSpentLamports+=tx.feeLamports+tx.setupLamports;for(const c of Object.values(state.ledger).filter(c=>c.payoutId===id)){c.status=status==='finalized'?'settled':'payable';if(status==='failed')delete c.payoutId}return p});
 }
}
export function payoutReceipt(p:PayoutRecord){return p.submittedAt&&p.signed?`https://explorer.solana.com/tx/${p.signed.signature}?cluster=devnet`:undefined}
