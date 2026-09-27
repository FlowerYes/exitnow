import RewardsPanel from '../rewards-panel';
import SiteNav from '../site-nav';

export const dynamic='force-dynamic';
export default async function Page() {
  let messagingAvailable=false;
  if(process.env.GATEWAY_PUBLIC_URL){try{
    const response=await fetch(new URL('/health',process.env.GATEWAY_PUBLIC_URL),{cache:'no-store',signal:AbortSignal.timeout(2000)});
    const health=await response.json();
    messagingAvailable=response.ok&&health.status==='ok'&&health.mode==='live';
  }catch{/* Show a recovery state instead of promising a code from an offline gateway. */}}

  return <div className="rewards-editorial-page"><SiteNav active="rewards"/><main><RewardsPanel messagingAvailable={messagingAvailable}/></main></div>;
}
