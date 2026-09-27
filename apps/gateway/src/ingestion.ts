import type {Inbound} from './state.ts';
// Backpressure the provider stream until this exact event is durably accepted.
// Retry interval is bounded; attempts deliberately continue while persistence is unavailable.
export async function persistInbound(event:Inbound,receive:(event:Inbound)=>Promise<unknown>,delay:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){let attempt=0;for(;;){try{await receive(event);return;}catch(e){if(e instanceof Error&&['outdated event','unauthorized sender'].includes(e.message))return;await delay(Math.min(30000,250*2**Math.min(attempt++,7)));}}}
