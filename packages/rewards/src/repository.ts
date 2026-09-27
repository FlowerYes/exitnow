import type {MongoClient} from 'mongodb';
import {MongoStateRepository} from '@exitnow/storage';
import type {ObservationTask,ObservationReport,RewardCredit,RewardsConfig} from './domain.ts';
import type {PayoutRecord} from './payout.ts';
import type {WalletBinding,WalletNonce} from './wallet.ts';
export interface RewardState {
 fundingAuthority?:string;
 campaignConfig?:RewardsConfig;
 tasks:Record<string,ObservationTask>; reports:Record<string,ObservationReport>; ledger:Record<string,RewardCredit>;
 payouts:Record<string,PayoutRecord>; wallets:Record<string,WalletBinding>; nonces:Record<string,WalletNonce>;
 knownConditions?:Record<string,{condition:string;observedAt:number;knownAt:number;reference:string}>;
 feeSpentLamports:number; feeReservedLamports:number;
}
export function initialRewardState():RewardState{return {tasks:{},reports:{},ledger:{},payouts:{},wallets:{},nonces:{},feeSpentLamports:0,feeReservedLamports:0}}
export interface RewardsRepository {transact<T>(fn:(state:RewardState)=>Promise<T>):Promise<T>}
export class MemoryRewardsRepository implements RewardsRepository {
 private state=initialRewardState(); private tail:Promise<unknown>=Promise.resolve();
 transact<T>(fn:(state:RewardState)=>Promise<T>):Promise<T>{const run=this.tail.then(async()=>{const next=structuredClone(this.state);const result=await fn(next);this.state=next;return structuredClone(result)});this.tail=run.catch(()=>{});return run}
}
/** Separate collection preserves historical treasury records; one document lock serializes budget and payout mutations. */
export class MongoRewardsRepository extends MongoStateRepository<RewardState> implements RewardsRepository {
 constructor(client:MongoClient,dbName:string){super(client,dbName,'rider_rewards_state',initialRewardState())}
}
