'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowDownUp, ArrowRight, Check, ChevronRight, Clock3, Copy, MapPin, RefreshCw, TrainFront, Bus, Footprints, ArrowUpRight} from 'lucide-react';
import {z} from 'zod';
import type {JourneyResult, JourneyStation, JourneyOption} from '../../../../packages/core/src/journey-v2';
import JourneyMap from '../journey-map';
import LocationSearch from '../location-search';
import '../planner.css';
import '../transit-editorial.css';
import SiteNav from '../site-nav';
import EtaShare from '../eta-share';

type Mode = 'demo' | 'google';
type Catalog = {stations:JourneyStation[]; googleConfigured:boolean; browserMapsConfigured:boolean};
const formatTime = (value:string) => new Intl.DateTimeFormat('en-US', {hour:'numeric', minute:'2-digit', timeZone:'America/New_York'}).format(new Date(value));
const minutes = (value:number) => Math.max(1, Math.ceil(value));
const timestampSchema = z.string().refine(value => Number.isFinite(Date.parse(value)));
const coordinateSchema = z.tuple([z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180)]);
const stationSchema = z.object({id:z.string().min(1), name:z.string().min(1), lat:z.number().finite().min(-90).max(90), lng:z.number().finite().min(-180).max(180), borough:z.string()});
const durationSchema = z.number().finite().nonnegative();
const catalogSchema = z.object({stations:z.array(stationSchema).min(1), googleConfigured:z.boolean(), browserMapsConfigured:z.boolean()});
const journeySchema = z.object({
  source:z.enum(['google','demo']), generatedAt:timestampSchema, origin:stationSchema, destination:stationSchema, warnings:z.array(z.string()),
  routes:z.array(z.object({
    id:z.string().min(1), title:z.string(), durationMinutes:durationSchema, departureTime:timestampSchema, arrivalTime:timestampSchema,
    transfers:durationSchema.int(), walkingMinutes:durationSchema, distanceMeters:durationSchema, path:z.array(coordinateSchema).min(2),
    crowding:z.enum(['unknown','low','moderate','high']), reason:z.string(),
    steps:z.array(z.object({mode:z.enum(['walk','transit']), line:z.string(), from:z.string(), to:z.string(), departureTime:timestampSchema.optional(), arrivalTime:timestampSchema.optional(), minutes:durationSchema, path:z.array(coordinateSchema), color:z.string(), vehicleType:z.string().optional()})).min(1),
  })).min(1),
});
function vehicleLabel(step:JourneyOption['steps'][number]) {
  if(step.mode==='walk')return 'Walk';
  const type=step.vehicleType?.toUpperCase()??'';
  if(type.includes('BUS')||type==='SHARE_TAXI')return 'Bus';
  if(type==='FERRY')return 'Ferry';
  if(type==='TRAM'||type==='TROLLEYBUS')return 'Tram';
  if(type.includes('RAIL')||type.includes('TRAIN')||type==='SUBWAY'||type==='METRO_RAIL'||!type)return 'Train';
  return 'Transit';
}
// Collapse Google's street-by-street walking instructions only in the presentation.
// The original result, timestamps and geometry remain untouched for the map.
function displaySteps(steps:JourneyOption['steps']) {
  const display:JourneyOption['steps']=[];
  for(const step of steps){
    const previous=display.at(-1);
    if(previous?.mode==='walk'&&step.mode==='walk'){
      previous.minutes+=step.minutes;
      previous.to=step.to;
      previous.arrivalTime=step.arrivalTime;
    }else display.push({...step});
  }
  return display;
}
function expiredDirections(result:JourneyResult, route:JourneyOption, at:number) {
  const boarding = route.steps.find(step => step.mode === 'transit')?.departureTime;
  return result.source === 'google' && (at - Date.parse(result.generatedAt) > 120000 || Boolean(boarding && at >= Date.parse(boarding)));
}

export default function PlannerPage() {
  const [catalog, setCatalog] = useState<Catalog|null>(null);
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  const [demoOrigin, setDemoOrigin] = useState('columbia');
  const [demoDestination, setDemoDestination] = useState('brooklyn');
  const [googleOrigin, setGoogleOrigin] = useState('Columbia University, New York, NY');
  const [googleDestination, setGoogleDestination] = useState('Empire State Building, New York, NY');
  const [mode, setMode] = useState<Mode>('google');
  const origin = mode === 'demo' ? demoOrigin : googleOrigin;
  const destination = mode === 'demo' ? demoDestination : googleDestination;
  const setOrigin = mode === 'demo' ? setDemoOrigin : setGoogleOrigin;
  const setDestination = mode === 'demo' ? setDemoDestination : setGoogleDestination;
  const [preferFewerTransfers, setPreferFewerTransfers] = useState(false);
  const [demoCrowding, setDemoCrowding] = useState<'typical'|'rush-hour'>('typical');
  const [result, setResult] = useState<JourneyResult|null>(null);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [now, setNow] = useState(Date.now());
  const request = useRef<AbortController|null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setConfigError('');
    fetch('/api/journeys', {signal:controller.signal, cache:'no-store'})
      .then(async response => {if (!response.ok) throw new Error('Could not load stations. Please retry.'); const parsed=catalogSchema.safeParse(await response.json());if(!parsed.success)throw new Error('Station details were incomplete. Please retry.');return parsed.data;})
      .then(data => {if(controller.signal.aborted)return;setCatalog(data); setMode(data.googleConfigured ? 'google' : 'demo');})
      .catch(err => {if (!controller.signal.aborted) setConfigError(err instanceof Error ? err.message : 'Could not load stations.');});
    return () => controller.abort();
  }, [configAttempt]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => {clearInterval(timer); request.current?.abort();};
  }, []);

  function invalidate() {
    request.current?.abort();
    setPending(false); setResult(null); setSelectedId(null); setError(''); setCopyStatus('');
  }
  async function planTrip() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(''); setCopyStatus(''); setResult(null); setSelectedId(null);
    try {
      const response = await fetch('/api/journeys', {method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal, body:JSON.stringify({origin:origin.trim(), destination:destination.trim(), mode, preferFewerTransfers,...(mode==='demo'?{demoCrowding}:{})})});
      const data:unknown = await response.json();
      if (!response.ok) throw new Error(data && typeof data==='object' && 'error' in data && typeof data.error==='string' ? data.error : 'Could not plan this trip. Please try again.');
      const parsed=journeySchema.safeParse(data);
      if(!parsed.success||parsed.data.source!==mode||parsed.data.origin.id!==origin.trim()||parsed.data.destination.id!==destination.trim())throw new Error('Journey details were incomplete or did not match your request. Please try again.');
      if (!controller.signal.aborted) {setResult(parsed.data); setSelectedId(parsed.data.routes[0].id); setNow(Date.now());}
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not plan this trip. Please try again.');
    } finally {if (!controller.signal.aborted) setPending(false);}
  }

  const route = result?.routes.find(item => item.id === selectedId) ?? result?.routes[0];
  const googleReady = !!catalog?.googleConfigured;
  const sameStation = Boolean(origin.trim()) && origin.trim().toLocaleLowerCase() === destination.trim().toLocaleLowerCase();
  const validLocations = Boolean(origin.trim() && destination.trim()) && !sameStation;
  const stale = Boolean(result && route && expiredDirections(result, route, now));
  const boroughs = [...new Set(catalog?.stations.map(station => station.borough) ?? [])];
  const stationOptions = boroughs.map(borough => <optgroup key={borough} label={borough}>{catalog?.stations.filter(station => station.borough === borough).map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</optgroup>);

  async function copyDirections() {
    if (!result || !route) return;
    if(expiredDirections(result,route,Date.now())){setNow(Date.now());setCopyStatus('Refresh your route before copying. These departure times may have passed.');return;}
    const text = `${result.source === 'demo' ? 'SYNTHETIC DEMO — not live transit advice' : 'Google transit estimate'}\n${result.origin.name} to ${result.destination.name}\n${minutes(route.durationMinutes)} min travel · Leave ${formatTime(route.departureTime)} ET · Arrive ${formatTime(route.arrivalTime)} ET\n${displaySteps(route.steps).map(step => `${step.mode === 'walk' ? 'Walk' : `Take ${step.line}`} from ${step.from} to ${step.to}${step.departureTime ? ` at ${formatTime(step.departureTime)} ET` : ''} (${minutes(step.minutes)} min)`).join('\n')}\nGenerated ${formatTime(result.generatedAt)} ET. Estimates may change.`;
    try {await navigator.clipboard.writeText(text); setCopyStatus('Directions copied.');}
    catch {setCopyStatus('Copy unavailable. You can select the directions below.');}
  }

  return <div className="planner">
    <a className="planner-skip" href="#planner-main">Skip to trip planner</a>
    <SiteNav active="planner"/>
    <main id="planner-main" className="planner-main">
      <div className="planner-layout">
        <section className="planner-controls" aria-label="Plan and compare trips">
          <div className="planner-heading"><h1>Where to?</h1><p>A little less guesswork.</p></div>
          <form onSubmit={event => {event.preventDefault(); if (catalog && validLocations && (mode === 'demo' || googleReady)) void planTrip();}}>
            <div className="planner-mode" role="group" aria-label="Journey data source"><button type="button" aria-pressed={mode === 'google'} onClick={() => {invalidate(); setMode('google');}}>Google estimates</button><button type="button" aria-pressed={mode === 'demo'} onClick={() => {invalidate(); setMode('demo');}}>Demo</button></div>
            <p className="planner-mode-note">{mode === 'demo' ? 'Synthetic trips. Modeled times and crowding.' : 'Search any address or place. Next available departures.'}</p>
            {configError && <div className="planner-alert" role="alert">{configError} <button type="button" onClick={() => setConfigAttempt(value => value + 1)}>Retry</button></div>}
            {mode === 'google' && catalog && !googleReady && <div className="planner-setup">Google routing isn’t connected yet.<a href="/setup">Set up Google Maps <ArrowRight size={14}/></a></div>}
            <div className={`planner-stations ${mode==='google'?'is-search':''}`}>
              {mode==='google'?<LocationSearch id="planner-origin" label="From" value={origin} disabled={!catalog} onChange={value=>{invalidate();setOrigin(value);}}/>:<><label htmlFor="planner-origin">From</label><select id="planner-origin" value={origin} disabled={!catalog} onChange={event=>{invalidate();setOrigin(event.target.value);}}>{catalog?stationOptions:<option value={origin}>Loading stations…</option>}</select></>}
              <button className="planner-swap" type="button" aria-label="Swap origin and destination" disabled={!catalog} onClick={()=>{invalidate();setOrigin(destination);setDestination(origin);}}><ArrowDownUp size={17}/></button>
              {mode==='google'?<LocationSearch id="planner-destination" label="To" value={destination} disabled={!catalog} onChange={value=>{invalidate();setDestination(value);}}/>:<><label htmlFor="planner-destination">To</label><select id="planner-destination" value={destination} disabled={!catalog} onChange={event=>{invalidate();setDestination(event.target.value);}}>{catalog?stationOptions:<option value={destination}>Loading stations…</option>}</select></>}
            </div>
            <label className="planner-preference"><input type="checkbox" checked={preferFewerTransfers} onChange={event => {invalidate(); setPreferFewerTransfers(event.target.checked);}}/>Prefer fewer transfers</label>
            {mode==='demo'&&<div className="planner-demo-conditions"><label htmlFor="planner-demo-crowding">Demo conditions</label><select id="planner-demo-crowding" value={demoCrowding} onChange={event=>{invalidate();setDemoCrowding(event.target.value as 'typical'|'rush-hour');}}><option value="typical">Typical service</option><option value="rush-hour">Rush-hour crowding</option></select></div>}
            {sameStation && <p className="planner-validation" role="alert">Choose two different locations.</p>}
            <button className="planner-submit" disabled={!catalog || pending || !validLocations || (mode === 'google' && !googleReady)} type="submit">{pending ? <><RefreshCw size={17} className="planner-spin"/>Finding your routes…</> : <>Find my route <ArrowUpRight size={18}/></>}</button>
            <p className="planner-coverage">{mode==='google'?'Google transit estimates · Crowding unavailable':catalog?`${catalog.stations.length} demo stations · ${boroughs.length} boroughs`:'Loading station coverage…'}</p>
          </form>
          {error && <p className="planner-alert" role="alert">{error}</p>}
          <div aria-live="polite" aria-atomic="true" className="planner-sr">{pending ? 'Finding routes.' : result ? `${result.routes.length} routes found.` : ''}</div>
          {result && <section className="planner-options" aria-labelledby="planner-route-title">
            <div className="planner-section-heading"><h2 id="planner-route-title">Your options</h2><span>{result.routes.length} {result.routes.length === 1 ? 'route' : 'routes'}</span></div>
            <div className="planner-source">{result.source === 'demo' ? 'Synthetic demo' : 'Google estimates'} · {formatTime(result.generatedAt)} ET</div>
            {result.routes.map((item, index) => <div key={item.id}><button type="button" className={`planner-option ${route?.id === item.id ? 'is-selected' : ''}`} aria-pressed={route?.id === item.id} onClick={() => {setSelectedId(item.id); setCopyStatus('');}}>
              <span className="planner-option-top"><span className="planner-option-name">{index === 0 ? 'Recommended' : `Alternative ${index}`}</span><span className="planner-duration">{minutes(item.durationMinutes)}<small> min</small></span></span>
              <span className="planner-route-lines">{displaySteps(item.steps).map((step,i)=><span key={`${step.line}-${i}`} className="planner-leg" title={step.mode==='walk'?`${minutes(step.minutes)} min walk`:vehicleLabel(step)}>{step.mode==='walk'?<Footprints size={15}/>:vehicleLabel(step)==='Bus'?<Bus size={15}/>:<TrainFront size={15}/>}<span className={step.mode==='transit'?'planner-line':''} style={step.mode==='transit'?{background:step.color}:undefined}>{step.mode==='walk'?`${minutes(step.minutes)} min`:step.line}</span></span>)}<span className="planner-arrive">Arrive {formatTime(item.arrivalTime)}</span></span>
              <span className="planner-option-bottom">{item.transfers === 0 ? 'No transfers' : `${item.transfers} ${item.transfers === 1 ? 'transfer' : 'transfers'}`}<span>{item.walkingMinutes ? `${minutes(item.walkingMinutes)} min walk` : 'Station-to-station'}<ChevronRight size={15}/></span></span>
              {result.source==='demo'&&<span className={`planner-option-crowding ${item.crowding==='high'?'is-busy':''}`}>Modeled crowding: {item.crowding}</span>}
            </button>{route?.id===item.id&&<a className="planner-view-directions" href="#planner-itinerary-title">View directions <ArrowDownUp size={15}/></a>}</div>)}
          </section>}
          {!result && !pending && <div className="planner-idle"><TrainFront size={24}/><p>A little less guesswork.</p><span>{mode==='google'?'A doorstep, a landmark, a favorite place. Start wherever you are.':'Choose two stations to explore the synthetic network.'}</span></div>}
        </section>
        <div className="planner-detail">
          <section className="planner-map" aria-label="Journey map"><JourneyMap result={result} selectedId={route?.id ?? ''} onSelect={id => {setSelectedId(id); setCopyStatus('');}} mode={mode}/></section>
          {result && route ? <section className="planner-itinerary" aria-labelledby="planner-itinerary-title">
            {stale && <div className="planner-refresh" role="status"><span>Times may have changed. Refresh before leaving.</span><button type="button" onClick={() => void planTrip()} disabled={pending}><RefreshCw size={14}/> Refresh</button></div>}
            <div className="planner-itinerary-heading"><div><span className="planner-data-label">{result.source === 'demo' ? 'Synthetic itinerary' : 'Google transit itinerary'}</span><h2 id="planner-itinerary-title" tabIndex={-1}>Your next moves.</h2><p>{result.origin.name} <ArrowRight size={14}/> {result.destination.name}</p></div><button className="planner-copy" type="button" onClick={() => void copyDirections()}>{copyStatus === 'Directions copied.' ? <Check size={17}/> : <Copy size={17}/>}Copy directions</button></div>
            <div className="planner-trip-summary"><span><Clock3 size={16}/>{minutes(route.durationMinutes)} min travel</span><span>Leave {formatTime(route.departureTime)} ET</span><span>Arrive {formatTime(route.arrivalTime)} ET</span>{result.source === 'demo' && <span>Modeled crowding: {route.crowding}</span>}</div>
            <p className="planner-route-reason">{route.reason}</p><ol className="planner-steps">{displaySteps(route.steps).map((step, index) => <li key={`${step.line}-${index}`}><span className={`planner-step-icon ${step.mode === 'walk' ? 'is-walk' : ''}`} style={step.mode === 'transit' ? {background:step.color} : undefined}>{step.mode === 'walk' ? <Footprints size={16}/> : step.line}</span><div><strong>{step.mode === 'walk' ? `Walk to ${step.to}` : `${vehicleLabel(step)} ${step.line}`}</strong><p>{step.from} <ArrowRight size={13}/> {step.to}</p>{step.departureTime && <span>Board {formatTime(step.departureTime)} · Arrive {step.arrivalTime ? formatTime(step.arrivalTime) : '—'} ET</span>}</div><span className="planner-step-duration">{minutes(step.minutes)} min</span></li>)}</ol>
            <p className="planner-copy-status" role="status">{copyStatus}</p>
            <EtaShare key={`${result.generatedAt}-${route.id}`} result={result} route={route} stale={stale}/>
            <details className="planner-evidence"><summary>Sources & trip assumptions</summary>{result.warnings.map(warning => <p key={warning}>{warning}</p>)}<p>Generated {formatTime(result.generatedAt)} ET. All times are New York time.</p></details>
          </section> : <div className="planner-map-caption"><MapPin size={18}/><p>{mode === 'demo' ? 'Explore New York, one connection at a time.' : 'Plan with Google transit estimates.'}<span>{mode === 'demo' ? 'The demo is a connected, illustrative network. It is not live travel guidance.' : 'Find a route to see the returned transit path and departure details.'}</span></p></div>}
        </div>
      </div>
      <footer className="planner-footer"><span>Good journeys start here.</span><div><a href="/setup">Data & setup</a><a href="/operations">Messaging replay</a></div></footer>
    </main>
  </div>;
}
