import {Connection,Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {ACCOUNT_SIZE,TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,getAccount,getMint,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction} from '@solana/spl-token';
import bs58 from 'bs58';
import type {PayoutAdapter,SignedPayout} from './payout.js';
/** Circle's official test USDC: https://developers.circle.com/stablecoins/usdc-contract-addresses */
export const DEVNET_USDC_MINT='4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const USDC_DECIMALS=6;
export class SolanaDevnetAdapter implements PayoutAdapter {
 constructor(private signer:Keypair,private connection:Connection=new Connection('https://api.devnet.solana.com','finalized')){}
 static fromSecretKey(bytes:Uint8Array){return new SolanaDevnetAdapter(Keypair.fromSecretKey(bytes))}
 async prepare(r:{recipient:string;amount:number;allowAccountSetup:boolean}):Promise<SignedPayout>{
  if(await this.connection.getGenesisHash()!==DEVNET_GENESIS)throw Error('Only Solana devnet payouts are allowed');
  if(!Number.isSafeInteger(r.amount)||r.amount<=0)throw Error('Invalid integer token amount');
  const owner=new PublicKey(r.recipient),mint=new PublicKey(DEVNET_USDC_MINT);if(!PublicKey.isOnCurve(owner.toBytes()))throw Error('Recipient must be a wallet owner');if(owner.equals(this.signer.publicKey))throw Error('Recipient cannot be payout signer');
  const mintAccount=await getMint(this.connection,mint,'finalized',TOKEN_PROGRAM_ID);if(mintAccount.decimals!==USDC_DECIMALS||!mintAccount.isInitialized)throw Error('Unexpected USDC mint decimals/state');
  const source=getAssociatedTokenAddressSync(mint,this.signer.publicKey),destination=getAssociatedTokenAddressSync(mint,owner);const from=await getAccount(this.connection,source,'finalized',TOKEN_PROGRAM_ID);if(!from.owner.equals(this.signer.publicKey)||!from.mint.equals(mint)||from.isFrozen||from.amount<BigInt(r.amount))throw Error('Campaign USDC account invalid or insufficiently funded');
  const destinationInfo=await this.connection.getAccountInfo(destination,'finalized');const createsAta=!destinationInfo;let setupLamports=0;
  if(createsAta){if(!r.allowAccountSetup)throw Error('Recipient account setup subsidy exhausted; create your USDC token account');setupLamports=await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE,'finalized')}
  else{const to=await getAccount(this.connection,destination,'finalized',TOKEN_PROGRAM_ID);if(!to.owner.equals(owner)||!to.mint.equals(mint)||to.isFrozen)throw Error('Invalid recipient token account')}
  const block=await this.connection.getLatestBlockhash('finalized');const tx=new Transaction({feePayer:this.signer.publicKey,...block});if(createsAta)tx.add(createAssociatedTokenAccountIdempotentInstruction(this.signer.publicKey,destination,owner,mint));tx.add(createTransferCheckedInstruction(source,mint,destination,this.signer.publicKey,BigInt(r.amount),USDC_DECIMALS));
  const fee=await this.connection.getFeeForMessage(tx.compileMessage(),'finalized');if(fee.value===null)throw Error('Unable to quote transaction fee');if(await this.connection.getBalance(this.signer.publicKey,'finalized')<fee.value+setupLamports)throw Error('Insufficient backend SOL for fees and account setup');tx.sign(this.signer);
  return {signature:bs58.encode(tx.signature!),raw:tx.serialize().toString('base64'),lastValidBlockHeight:block.lastValidBlockHeight,feeLamports:fee.value,setupLamports,destination:destination.toBase58(),createsAta};
 }
 async broadcast(tx:SignedPayout){if(await this.connection.getGenesisHash()!==DEVNET_GENESIS)throw Error('Only Solana devnet payouts are allowed');const signature=await this.connection.sendRawTransaction(Buffer.from(tx.raw,'base64'),{skipPreflight:false,maxRetries:2,preflightCommitment:'finalized'});if(signature!==tx.signature)throw Error('RPC returned a different signature')}
 async status(tx:SignedPayout,r:{recipient:string;amount:number}):Promise<'confirmed'|'finalized'|'failed'|'unknown'>{
  if(await this.connection.getGenesisHash()!==DEVNET_GENESIS)throw Error('Only Solana devnet payouts are allowed');const status=(await this.connection.getSignatureStatuses([tx.signature],{searchTransactionHistory:true})).value[0];if(!status)return 'unknown';if(status.confirmationStatus!=='finalized')return status.err?'unknown':status.confirmationStatus==='confirmed'?'confirmed':'unknown';if(status.err)return 'failed';
  const receipt=await this.connection.getParsedTransaction(tx.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!receipt||!receipt.meta||receipt.meta.err)return 'unknown';
  const expectedDestination=getAssociatedTokenAddressSync(new PublicKey(DEVNET_USDC_MINT),new PublicKey(r.recipient)).toBase58();if(tx.destination!==expectedDestination)return 'unknown';
  const transfers=receipt.transaction.message.instructions.filter(ix=>'parsed' in ix&&ix.programId.equals(TOKEN_PROGRAM_ID)&&ix.parsed.type==='transferChecked');const matching=transfers.filter(ix=>{if(!('parsed' in ix))return false;const info=ix.parsed.info;return info.destination===expectedDestination&&info.mint===DEVNET_USDC_MINT&&info.authority===this.signer.publicKey.toBase58()&&info.tokenAmount.amount===String(r.amount)&&info.tokenAmount.decimals===USDC_DECIMALS});
  const index=receipt.transaction.message.accountKeys.findIndex(key=>key.pubkey.toBase58()===expectedDestination);const post=receipt.meta.postTokenBalances?.find(b=>b.accountIndex===index&&b.mint===DEVNET_USDC_MINT&&b.owner===r.recipient);const pre=receipt.meta.preTokenBalances?.find(b=>b.accountIndex===index&&b.mint===DEVNET_USDC_MINT);if(matching.length!==1||!post||post.uiTokenAmount.decimals!==USDC_DECIMALS||BigInt(post.uiTokenAmount.amount)-BigInt(pre?.uiTokenAmount.amount??'0')!==BigInt(r.amount))return 'unknown';return 'finalized';
 }
}
