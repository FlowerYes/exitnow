import type {RewardsRepository} from './repository.ts';
/** Initial allocation proof is durable. Reconciliation must still work after tokens leave the source ATA. */
export async function ensureCampaignFunding(repo:RewardsRepository,allocated:number,authority:string,probe:()=>Promise<bigint>){
 const existing=await repo.transact(async s=>({authority:s.fundingAuthority,allocation:s.campaignConfig?.allocatedFunding??0}));
 if(existing.authority&&existing.authority!==authority)throw Error('Campaign signer differs from persisted funding authority');
 if(existing.authority&&existing.allocation>0)return;
 const balance=await probe();if(balance<BigInt(allocated))throw Error('Campaign must be prefunded with official Circle devnet USDC');
 await repo.transact(async s=>{if(s.fundingAuthority&&s.fundingAuthority!==authority)throw Error('Campaign signer changed concurrently');s.fundingAuthority=authority});
}
