import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export type RiderSession={accountId:string;expiresAt:number;nonce:string};
function secret(){const value=process.env.REWARDS_SESSION_SECRET;if(!value||value.length<32)throw Error('Rewards session access is not configured');return value}
export function createRiderAccess(accountId:string,now=Date.now()):string{if(!accountId||accountId.length>300)throw Error('Invalid account');const payload=Buffer.from(JSON.stringify({accountId,expiresAt:now+15*60_000,nonce:randomBytes(18).toString('hex')})).toString('base64url');return payload+'.'+createHmac('sha256',secret()).update(payload).digest('base64url')}
export function authenticateRider(request:Request,now=Date.now()):RiderSession|null{
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token||token.length>2048)return null;
 try{const [body,sig,extra]=token.split('.');if(extra||!body||!sig)return null;const actual=Buffer.from(sig,'base64url'),expected=createHmac('sha256',secret()).update(body).digest();if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;const session=JSON.parse(Buffer.from(body,'base64url').toString());if(typeof session.accountId!=='string'||!session.accountId||session.accountId.length>300||typeof session.nonce!=='string'||!Number.isSafeInteger(session.expiresAt)||session.expiresAt<=now||session.expiresAt>now+15*60_000)return null;return session;}catch{return null}
}
export function resolveRewardIdentity(accountId:string){
 const links=JSON.parse(process.env.REWARDS_ACCOUNT_LINKS_JSON||'{}') as Record<string,unknown>;
 const group=Object.hasOwn(links,accountId)?links[accountId]:accountId;
 if(typeof group!=='string'||!group||group.length>300)throw Error('Invalid trusted account linkage');
 return {accountId,groupId:group};
}
export function moderatorAuthorized(request:Request){const expected=process.env.REWARDS_MODERATOR_TOKEN;if(!expected||expected.length<32)return false;const actual=Buffer.from(request.headers.get('authorization')||''),wanted=Buffer.from('Bearer '+expected);return actual.length===wanted.length&&timingSafeEqual(actual,wanted)}
