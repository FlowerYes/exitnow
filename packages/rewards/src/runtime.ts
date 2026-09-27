import {readFileSync} from 'node:fs';
import {ensureCampaignFunding} from './funding.ts';
import {MongoClient} from 'mongodb';
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {getAccount,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {MongoRewardsRepository} from './repository.ts';
import {RewardsService} from './domain.ts';
import {RewardsPayoutService} from './payout.ts';
import {WalletService} from './wallet.ts';
import {SolanaDevnetAdapter,DEVNET_GENESIS,DEVNET_USDC_MINT} from './solana.ts';
export {createRiderAccess,resolveRewardIdentity} from './auth.ts';
function integer(name:string,fallback:number){const value=process.env[name];if(value===undefined||value==='')return fallback;const number=Number(value);if(!Number.isSafeInteger(number)||number<0)throw Error(`Invalid ${name}`);return number}
function signer(){const raw=process.env.SOLANA_KEYPAIR_PATH?readFileSync(process.env.SOLANA_KEYPAIR_PATH,'utf8'):process.env.SOLANA_SECRET_KEY;if(!raw)throw Error('Devnet payout blocked: configure a funded devnet-only SOLANA_KEYPAIR_PATH or SOLANA_SECRET_KEY');const bytes:unknown=JSON.parse(raw);if(!Array.isArray(bytes)||bytes.length!==64||bytes.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('Invalid backend devnet signer');return Keypair.fromSecretKey(Uint8Array.from(bytes))}
async function configure(){
 if(!process.env.MONGODB_URI)throw Error('Rewards database is not configured');
 const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:4,serverSelectionTimeoutMS:5000});await client.connect();
 const repo=new MongoRewardsRepository(client,process.env.MONGODB_DB||'exitnow');
 try{
  await repo.initialize();
  const allocatedFunding=integer('REWARDS_CAMPAIGN_UNITS',0);
  if(allocatedFunding){const key=signer();await ensureCampaignFunding(repo,allocatedFunding,key.publicKey.toBase58(),async()=>{const connection=new Connection('https://api.devnet.solana.com','finalized');if(await connection.getGenesisHash()!==DEVNET_GENESIS)throw Error('Devnet required');const account=await getAccount(connection,getAssociatedTokenAddressSync(new PublicKey(DEVNET_USDC_MINT),key.publicKey),'finalized');if(account.isFrozen||!account.owner.equals(key.publicKey)||!account.mint.equals(new PublicKey(DEVNET_USDC_MINT)))throw Error('Campaign USDC account ownership or mint is invalid');return account.amount});}
  const service=new RewardsService(repo,{allocatedFunding,dailyBudget:integer('REWARDS_DAILY_UNITS',allocatedFunding),stationLimit:integer('REWARDS_STATION_UNITS',allocatedFunding),categoryLimit:integer('REWARDS_CATEGORY_UNITS',allocatedFunding),groupDailyCap:integer('REWARDS_GROUP_DAILY_UNITS',2_000_000),maxActiveDiscoveries:integer('REWARDS_ACTIVE_DISCOVERIES',2),taskTtlMs:integer('REWARDS_RESERVATION_MS',1_800_000)});
  await service.snapshot();
  return {repo,service};
 }catch(error){await client.close();throw error}
}
let pending:ReturnType<typeof configure>|undefined;
export function getRewardsContext(){if(!pending)pending=configure().catch(e=>{pending=undefined;throw e});return pending}
export async function getRewardsService(){return (await getRewardsContext()).service}
export async function getWalletService(){return new WalletService((await getRewardsContext()).repo,process.env.REWARDS_WEB_ORIGIN||'http://localhost:3000')}
export async function getPayoutService(){return new RewardsPayoutService((await getRewardsContext()).repo,new SolanaDevnetAdapter(signer()),{thresholdUnits:payoutThreshold(),feeBudgetLamports:integer('REWARDS_FEE_BUDGET_LAMPORTS',0),maxFeePerPayoutLamports:integer('REWARDS_MAX_PAYOUT_FEE_LAMPORTS',2_100_000),maxAccountSetupsPerGroup:integer('REWARDS_GROUP_ATA_LIMIT',1)})}
export function payoutThreshold(){return integer('REWARDS_PAYOUT_THRESHOLD_UNITS',100_000)}
