'use client';
import {useState} from 'react';

type Quote={funded:boolean;amount:number;taskId?:string;expiresAt?:number;reason:string};
const categories=[['platform_crowding','Platform crowding'],['boarding_difficulty','Boarding difficulty'],['elevator_status','Elevator'],['escalator_status','Escalator'],['entrance_obstruction','Blocked entrance']];
const localTime=()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)};
export default function ReportForm({request,onSubmitted}:{request:(action:Record<string,unknown>)=>Promise<any>;onSubmitted:()=>Promise<void>}){
 const [fields,setFields]=useState({station:'',category:'platform_crowding',condition:'',asset:'',direction:'',observedAt:localTime()});
 const [quote,setQuote]=useState<Quote|null>(null),[submissionId,setSubmissionId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState('');
 const equipment=['elevator_status','escalator_status','entrance_obstruction'].includes(fields.category);
 const observation={...fields,asset:equipment?fields.asset:undefined,direction:equipment?undefined:fields.direction,observedAt:new Date(fields.observedAt).getTime(),taskId:quote?.taskId};
 function change(key:keyof typeof fields,value:string){setFields(previous=>({...previous,[key]:value}));setQuote(null);setError('');setReceipt('')}
 async function prepare(){setBusy(true);setError('');setReceipt('');try{setQuote(await request({action:'prepare_report',observation}));setSubmissionId(crypto.randomUUID())}catch(e){setError(e instanceof Error?e.message:'Could not check this report. Please try again.')}finally{setBusy(false)}}
 async function submit(){if(!quote)return;setBusy(true);setError('');try{const result=await request({action:'submit_report',observation,expectedAmount:quote.amount,submissionId,confirmed:true});setReceipt(`Report received. Reference: ${result.id}. Verification is pending; no reward has been earned yet.`);setQuote(null);try{await onSubmitted()}catch{setError('Your report was saved, but the balance could not refresh. Use Refresh balance.')}}catch(e){setError(e instanceof Error?e.message:'Could not submit. Try again; retries use the same report reference.')}finally{setBusy(false)}}
 return <section className="report-entry" id="report" aria-labelledby="report-title"><h2 id="report-title">Report a problem</h2><p>Share a condition you saw at a station, including equipment that is working normally. No wallet needed.</p>
 <form onSubmit={e=>{e.preventDefault();void prepare()}}>
 <fieldset disabled={busy||Boolean(quote)}><legend>What did you observe?</legend><div className="report-fields">
 <label>Station<input required maxLength={160} value={fields.station} onChange={e=>change('station',e.target.value)} placeholder="e.g. 116 St–Columbia University"/></label>
 <label>Report type<select value={fields.category} onChange={e=>change('category',e.target.value)}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <label>{equipment?'Equipment or entrance':'Direction or platform'}<input required maxLength={160} value={equipment?fields.asset:fields.direction} onChange={e=>change(equipment?'asset':'direction',e.target.value)} placeholder={equipment?'e.g. elevator EL-1 at Broadway':'e.g. downtown 1 platform'}/></label>
 <label>Observed at<input type="datetime-local" required value={fields.observedAt} onChange={e=>change('observedAt',e.target.value)}/></label>
 <label className="report-condition">What did you see?<textarea required maxLength={160} value={fields.condition} onChange={e=>change('condition',e.target.value)} placeholder="Describe the condition you personally observed."/></label>
 </div></fieldset>
 {!quote&&<button className="dark" disabled={busy||Boolean(receipt)}>{busy?'Checking…':'Review report & reward'}</button>}
 </form>
 {quote&&<div className="report-confirm" role="region" aria-label="Confirm report"><h3>{quote.funded?`${quote.amount/1_000_000} test USDC if verified`:'Unpaid contribution'}</h3><p>{quote.funded?'This amount is reserved provisionally. Independent verification is required before you earn it.':'No funded reward is available for this report. You can still share it without payment.'}</p><p>{quote.reason}</p>{quote.expiresAt&&<p>Reservation expires {new Date(quote.expiresAt).toLocaleTimeString()}.</p>}<div className="report-actions"><button className="dark" disabled={busy} onClick={()=>void submit()}>{busy?'Submitting…':quote.funded?'Submit report':'Submit unpaid report'}</button><button className="text-button" disabled={busy} onClick={()=>{setQuote(null);setError('')}}>Edit report</button></div></div>}
 {error&&<p className="error" role="alert">{error}</p>}{receipt&&<><p className="reward-message" role="status">{receipt}</p><button className="text-button" onClick={()=>{setReceipt('');setFields({...fields,condition:'',observedAt:localTime()})}}>Report another observation</button></>}
 <p className="fine-print">Report only what you personally observed. This form does not contact MTA staff or emergency services.</p>
 </section>
}
