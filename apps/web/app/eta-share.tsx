'use client';
import {useEffect, useRef, useState} from 'react';
import {Share2, MessageCircle, Copy, Users} from 'lucide-react';
import type {JourneyResult, JourneyOption} from '../../../packages/core/src/journey-v2';
import './eta-share.css';

export function etaMessage(result:JourneyResult, route:JourneyOption) {
 const arrival=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).format(new Date(route.arrivalTime));
 return `${result.source==='demo'?'SYNTHETIC DEMO — not a real arrival update.\n':''}ExitNow: Your friend shared their trip from ${result.origin.name.trim()} to ${result.destination.name.trim()}. Estimated arrival: ${arrival} ET. Times may change. One-time ETA update.`;
}
export default function EtaShare({result,route,stale}:{result:JourneyResult;route:JourneyOption;stale:boolean}) {
 const [open,setOpen]=useState(false),[phone,setPhone]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const [consent,setConsent]=useState(false),[accessCode,setAccessCode]=useState(''),[hosted,setHosted]=useState(true),[receipt,setReceipt]=useState('');
 const sending=useRef(false);
 useEffect(()=>{setHosted(!['localhost','127.0.0.1','[::1]'].includes(window.location.hostname));},[]);
 const message=etaMessage(result,route);
 const normalizedPhone=phone.replace(/[\s()-]/g,'');
 const validPhone=/^\+[1-9]\d{7,14}$/.test(normalizedPhone);
 function fresh(){const boarding=route.steps.find(step=>step.mode==='transit')?.departureTime;return !stale&&(result.source==='demo'||(Date.now()-Date.parse(result.generatedAt)<=120000&&(!boarding||Date.now()<Date.parse(boarding))));}
 async function sendPhoton(){
  if(sending.current||busy)return;
  if(!fresh()){setReceipt('Refresh your route before sending this ETA.');return;}
  if(!validPhone||!consent||(hosted&&!accessCode.trim())){setReceipt('Enter a phone number with country code, confirm consent, and provide an access code if required.');return;}
  sending.current=true;setBusy(true);setReceipt('');
  try {
   const response=await fetch('/api/eta',{method:'POST',headers:{'Content-Type':'application/json',...(accessCode.trim()?{Authorization:`Bearer ${accessCode.trim()}`}:{})},body:JSON.stringify({phone:normalizedPhone,consent:true,source:result.source,origin:result.origin.name,destination:result.destination.name,arrivalTime:route.arrivalTime,generatedAt:result.generatedAt,departureTime:route.steps.find(step=>step.mode==='transit')?.departureTime||route.departureTime})});
   const data=await response.json();
   if(!response.ok||data.accepted!==true)throw new Error(typeof data.error==='string'?data.error:'Photon could not accept this ETA.');
   setReceipt('Photon accepted your ETA. Delivery is not yet confirmed.');
  }catch(error){setReceipt(error instanceof Error?error.message:'The request could not be completed. Delivery is unconfirmed.');}
  finally{sending.current=false;setBusy(false);}
 }
 async function share(copy=false){
  if(!fresh()){setStatus('Refresh your route before sharing this ETA.');return;}
  setBusy(true);setStatus('');
  try {
   if(!copy&&navigator.share){await navigator.share({title:'My arrival time',text:message});setStatus('Shared through your device. Delivery is handled by the app you chose.');}
   else {await navigator.clipboard.writeText(message);setStatus('ETA copied. Paste it into a message to your friend.');}
  }catch(error){setStatus(error instanceof Error&&error.name==='AbortError'?'Sharing canceled. Nothing sent.':'Sharing unavailable. Select and copy the message below.');}
  finally{setBusy(false);}
 }
 return <section className="eta-share" aria-label="Notify friends about your arrival">
  <button className="eta-toggle" type="button" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="eta-sharing"><Users size={18}/>Notify friends<span>{open?'−':'+'}</span></button>
  {open&&<div id="eta-sharing" className="eta-content">
   <h3>Let them know when you’ll arrive.</h3><p>Share this trip’s ETA with a friend. You choose who receives it.</p>
   {stale&&<p role="alert">Refresh your route before sharing. These times may have changed.</p>}
   <textarea aria-label="ETA message" readOnly value={message} rows={4}/>
   <div className="eta-actions"><button type="button" disabled={stale||busy} onClick={()=>void share()}><Share2 size={16}/>Share ETA</button><button type="button" disabled={stale||busy} onClick={()=>void share(true)}><Copy size={16}/>Copy message</button></div>
   <label htmlFor="eta-phone">Or text a friend</label><div className="eta-phone"><input id="eta-phone" disabled={busy} type="tel" autoComplete="off" placeholder="Phone number, with country code" value={phone} onChange={event=>{setPhone(event.target.value);setStatus('');}}/><a aria-disabled={!validPhone||stale||busy} href={validPhone&&!stale&&!busy?`sms:${phone.replace(/[^+\d]/g,'')}?body=${encodeURIComponent(message)}`:undefined} onClick={event=>{if(busy||!validPhone||!fresh()){event.preventDefault();setStatus('Enter a valid phone number and refresh any stale route.');}else setStatus('Opening your messaging app. Review the message and tap Send there.');}}><MessageCircle size={16}/>Open text</a></div>
   <p className="eta-note" id="eta-phone-help">Include the country code, for example +1 212 555 0100.</p>
   <label className="eta-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/><span>My friend agreed to receive this one-time ETA.</span></label>
   <label htmlFor="eta-access">Private access code {hosted?'(required)':'(optional)'}</label>
   <input className="eta-access" id="eta-access" type="password" autoComplete="off" value={accessCode} disabled={busy} onChange={event=>setAccessCode(event.target.value)} placeholder="Ask ExitNow messaging for your private rider code"/>
   <div className="eta-actions"><button type="button" disabled={stale||busy||!validPhone||!consent||(hosted&&!accessCode.trim())} onClick={()=>void sendPhoton()}>{busy?'Working…':'Send ETA with Photon'}</button></div>
   <p role="status" className="eta-status">{receipt}</p>
   <p className="eta-note">One-time sharing. No automatic tracking. Open text lets you review and send in your messaging app.</p><p role="status" className="eta-status">{status}</p>
  </div>}
 </section>;
}
