/** Real devnet transfer; synthetic reports in a dedicated, durable Mongo database. */
import assert from 'node:assert/strict';
import {createPrivateKey, randomUUID, sign} from 'node:crypto';
import {chmod, mkdir, open, readFile, rename, writeFile} from 'node:fs/promises';
import {MongoClient} from 'mongodb';
import {Connection, Keypair, PublicKey} from '@solana/web3.js';
import {getAccount, getAssociatedTokenAddressSync} from '@solana/spl-token';
import bs58 from 'bs58';
import {MongoRewardsRepository, RewardsService, RewardsPayoutService, WalletService, SolanaDevnetAdapter, DEVNET_GENESIS, DEVNET_USDC_MINT, type PayoutAdapter, type ReportInput} from '../packages/rewards/src/index.ts';
import {ensureCampaignFunding} from '../packages/rewards/src/funding.ts';

const execute=process.argv.includes('--execute');
if(process.argv.slice(2).some(arg=>arg!=='--execute'))throw Error('Only --execute is supported; omission is read-only readiness');
const path=process.env.SOLANA_KEYPAIR_PATH;
if(!path)throw Error('Set SOLANA_KEYPAIR_PATH to the devnet-only backend keypair file');
const bytes:unknown=JSON.parse(await readFile(path,'utf8'));
if(!Array.isArray(bytes)||bytes.length!==64||bytes.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('Invalid keypair file');
const signer=Keypair.fromSecretKey(Uint8Array.from(bytes));
const connection=new Connection('https://api.devnet.solana.com','finalized');
assert.equal(await connection.getGenesisHash(),DEVNET_GENESIS,'Devnet required');
const mint=new PublicKey(DEVNET_USDC_MINT),source=getAssociatedTokenAddressSync(mint,signer.publicKey);
const sourceAccount=await getAccount(connection,source,'finalized');
assert(sourceAccount.owner.equals(signer.publicKey)&&sourceAccount.mint.equals(mint)&&!sourceAccount.isFrozen,'Invalid source USDC account');
const solLamports=await connection.getBalance(signer.publicKey,'finalized');
const readiness={network:'devnet',signer:signer.publicKey.toBase58(),mint:DEVNET_USDC_MINT,solLamports,usdcBaseUnits:sourceAccount.amount.toString(),mongoConfigured:!!process.env.MONGODB_URI,readyForNewPayout:solLamports>=2_100_000&&sourceAccount.amount>=1_000_000n};
console.log(JSON.stringify({mode:execute?'execute':'read-only readiness',...readiness}));
if(!execute)process.exit(0);
if(!process.env.MONGODB_URI)throw Error('MONGODB_URI required');

const directory='.data/live-payout-verification';
await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const lock=await open(`${directory}/run.lock`,'wx',0o600).catch(()=>{throw Error('Verification lock exists; verify no other run is active before manually removing it')});
const journalPath=`${directory}/journal.json`,recipientPath=`${directory}/recipient.json`;
type Journal={database:string;signer:string;recipient:string;observedAt:number;recipientBefore:string};
let client:MongoClient|undefined;
try{
 let journal:Journal;
 try{journal=JSON.parse(await readFile(journalPath,'utf8')) as Journal;}catch(error){
  if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  if(!readiness.readyForNewPayout)throw Error('Fund at least 0.0021 devnet SOL and 1 test USDC before executing');
  const recipient=Keypair.generate();
  await writeFile(recipientPath,JSON.stringify(Array.from(recipient.secretKey)),{mode:0o600,flag:'wx'});
  journal={database:`exitnow_live_payout_fixture_${randomUUID().replaceAll('-','')}`,signer:signer.publicKey.toBase58(),recipient:recipient.publicKey.toBase58(),observedAt:Date.now(),recipientBefore:'0'};
  await writeFile(`${journalPath}.tmp`,JSON.stringify(journal,null,2),{mode:0o600});await rename(`${journalPath}.tmp`,journalPath);
 }
 assert.equal(journal.signer,signer.publicKey.toBase58(),'Original signer required for reconciliation');
 assert.match(journal.database,/^exitnow_live_payout_fixture_[a-f0-9]{32}$/);
 const recipient=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(recipientPath,'utf8'))));
 assert.equal(recipient.publicKey.toBase58(),journal.recipient);
 await chmod(recipientPath,0o600);await chmod(journalPath,0o600);
 client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000,maxPoolSize:4});await client.connect();
 let repo=new MongoRewardsRepository(client,journal.database);await repo.initialize();
 await ensureCampaignFunding(repo,1_000_000,journal.signer,async()=>sourceAccount.amount);
 let service=new RewardsService(repo,{allocatedFunding:1_000_000});
 const identity={accountId:'fixture-live-devnet-recipient',groupId:'fixture-live-devnet-group'};
 const input:ReportInput={station:'fixture-station-not-live-transit',asset:'fixture-elevator',category:'elevator_status',condition:'working',observedAt:journal.observedAt};
 let snapshot=await service.snapshot();
 let report=snapshot.reports.find(r=>r.accountId===identity.accountId);
 if(!report){const prepared=await service.prepareReport(input,identity);assert.equal(prepared.provisionalAmount,600_000);const submitted=await service.submitReport({...input,taskId:prepared.taskId},identity,{requireFunded:true,requireProvisionalAmount:600_000});report=submitted.report;}
 if(!snapshot.ledger.length)await service.review(report.id,{...input,kind:'moderator',decision:'accept',reviewerId:'fixture-reviewer',reference:'fixture:synthetic-report-real-devnet-payout',reason:'Synthetic isolated test evidence; not a real station condition or live rider report'});
 snapshot=await service.snapshot();assert.equal(snapshot.earnedBalance,600_000);
 const wallet=new WalletService(repo,'http://localhost:3001');
 const bound=await repo.transact(async state=>state.wallets[identity.accountId]);
 if(!bound){const challenge=await wallet.challenge(identity.accountId,journal.recipient);const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(recipient.secretKey.slice(0,32))]),format:'der',type:'pkcs8'});await wallet.bind(identity.accountId,challenge.id,bs58.encode(sign(null,Buffer.from(challenge.message),privateKey)));}
 let signingCalls=0;
 const real=new SolanaDevnetAdapter(signer,connection);
 const adapter:PayoutAdapter={prepare:async request=>{signingCalls++;return real.prepare(request)},broadcast:tx=>real.broadcast(tx),status:(tx,request)=>real.status(tx,request)};
 let payouts=new RewardsPayoutService(repo,adapter,{feeBudgetLamports:2_100_000});
 const existing=await repo.transact(async state=>Object.values(state.payouts));assert(existing.length<=1);
 let payout=existing[0]??await payouts.claim(identity.accountId,identity.groupId);
 if(payout.status==='failed')throw Error('Existing failed payout needs manual review; script never creates replacement');
 if(payout.status!=='finalized')assert.equal((await payouts.claim(identity.accountId,identity.groupId)).id,payout.id,'Duplicate claim must reuse pending payout');
 payout=await payouts.process(payout.id);
 const firstSignature=payout.signed?.signature;assert(firstSignature,'Signed transaction must be durable before restart');
 // Close the database connection and reconstruct every service; keep original durable transaction.
 await client.close();client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000,maxPoolSize:4});await client.connect();
 repo=new MongoRewardsRepository(client,journal.database);service=new RewardsService(repo,{allocatedFunding:1_000_000});payouts=new RewardsPayoutService(repo,adapter,{feeBudgetLamports:2_100_000});
 const deadline=Date.now()+120_000;
 while(payout.status!=='finalized'&&payout.status!=='failed'&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,3000));payout=await payouts.process(payout.id);assert.equal(payout.signed?.signature,firstSignature);}
 const durable=await repo.transact(async state=>({payouts:Object.values(state.payouts),ledger:Object.values(state.ledger)}));
 assert.equal(durable.payouts.length,1);assert(signingCalls<=1,'Reconciliation must not sign a new transaction');
 const destination=getAssociatedTokenAddressSync(mint,recipient.publicKey);
 const destinationInfo=await connection.getAccountInfo(destination,'finalized');
 const received=destinationInfo?(await getAccount(connection,destination,'finalized')).amount:0n;
 if(payout.status==='finalized'){
  assert.equal(received-BigInt(journal.recipientBefore),600_000n);
  assert(durable.ledger.every(c=>c.status==='settled'));
  await assert.rejects(()=>payouts.claim(identity.accountId,identity.groupId),/below payout threshold/);
  assert.equal((await payouts.process(payout.id)).signed?.signature,firstSignature);
 }
 const evidence={checkedAt:new Date().toISOString(),mode:'real Solana devnet payout from synthetic isolated report and moderator evidence',livePhotonGrokReport:false,network:'devnet',database:journal.database,signer:journal.signer,recipient:journal.recipient,mint:DEVNET_USDC_MINT,payoutId:payout.id,amountBaseUnits:payout.amount,status:payout.status,signature:firstSignature,explorer:payout.submittedAt?`https://explorer.solana.com/tx/${firstSignature}?cluster=devnet`:null,signingCallsThisProcess:signingCalls,durablePayoutCount:durable.payouts.length,recipientBalanceBaseUnits:received.toString(),restartReconciliation:true,duplicateClaimPrevented:payout.status==='finalized',retention:'Mongo fixture and ignored recipient/journal retained for idempotent rerun; never delete while payout is uncertain'};
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/live-payout-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
 if(payout.status!=='finalized'){process.exitCode=2;console.log('Not finalized; rerun the same command to reconcile the original transaction.');}
}finally{await client?.close();await lock.close();const {unlink}=await import('node:fs/promises');await unlink(`${directory}/run.lock`);}
