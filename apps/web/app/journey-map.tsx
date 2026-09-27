'use client';
import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import {journeyStations,type JourneyResult} from '../../../packages/core/src/journey-v2';
import 'leaflet/dist/leaflet.css';

type LatLng={lat:number;lng:number};
interface GoogleMap {fitBounds(bounds:GoogleBounds,padding?:number):void}
interface GoogleBounds {extend(point:LatLng):void}
interface GoogleOverlay {setMap(map:GoogleMap|null):void;addListener(name:string,handler:()=>void):{remove():void}}
interface GoogleMaps {
 Map:new(element:HTMLElement,options:Record<string,unknown>)=>GoogleMap;
 LatLngBounds:new()=>GoogleBounds;
 Polyline:new(options:Record<string,unknown>)=>GoogleOverlay;
 Marker:new(options:Record<string,unknown>)=>GoogleOverlay;
 SymbolPath:{CIRCLE:number};
 event:{trigger(instance:GoogleMap,name:string):void;clearInstanceListeners(instance:object):void};
}
type MapsWindow=Window&{google?:{maps:GoogleMaps};exitNowMapsReady?:()=>void;gm_authFailure?:()=>void};
let googleLoading:Promise<GoogleMaps>|null=null;
let googleAuthFailed=false;
function loadGoogleMaps(key:string):Promise<GoogleMaps>{
 if(googleAuthFailed)return Promise.reject(new Error('Google Maps authorization failed. Check the browser key configuration and reload the page.'));
 const browser=window as MapsWindow;if(browser.google?.maps.Map)return Promise.resolve(browser.google.maps);if(googleLoading)return googleLoading;
 googleLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.id='exitnow-google-maps';script.async=true;
  let done=false;const fail=()=>{window.dispatchEvent(new Event('exitnow-google-map-error'));if(done)return;done=true;clearTimeout(timer);script.remove();googleLoading=null;delete browser.exitNowMapsReady;reject(new Error('Google Maps could not load. Check the browser key and connection.'));};
  const timer=setTimeout(fail,15000);
  browser.exitNowMapsReady=()=>{if(done)return;if(!browser.google?.maps.Map){fail();return;}done=true;clearTimeout(timer);delete browser.exitNowMapsReady;resolve(browser.google.maps);};
  // Authentication may fail after the script callback has already resolved.
  // Keep that failure terminal for this document rather than reusing its SDK.
  browser.gm_authFailure=()=>{googleAuthFailed=true;fail();};script.onerror=fail;
  script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=exitNowMapsReady&loading=async&v=weekly`;
  document.head.appendChild(script);
 });return googleLoading;
}
export interface JourneyMapProps {result:JourneyResult|null;selectedId:string;onSelect:(id:string)=>void;mode:'google'|'demo'}
export default function JourneyMap({result,selectedId,onSelect,mode}:JourneyMapProps){
 const container=useRef<HTMLDivElement>(null),leafletMap=useRef<Leaflet.Map|null>(null),leaflet=useRef<typeof Leaflet|null>(null),googleMap=useRef<GoogleMap|null>(null),google=useRef<GoogleMaps|null>(null);
 const [ready,setReady]=useState(0),[attempt,setAttempt]=useState(0),[status,setStatus]=useState<'loading'|'ready'|'error'|'auth-error'|'unconfigured'>('loading');
 const select=useRef(onSelect);select.current=onSelect;
 const active=result?.source===mode?result:null;
 const routes=active?.routes??[];
 const selected=routes.find(r=>r.id===selectedId)??routes[0];
 const fitRef=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let disposed=false;let map:Leaflet.Map|undefined;let gm:GoogleMap|undefined;let observer:ResizeObserver|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
  setStatus('loading');
  const resize=()=>{map?.invalidateSize({pan:false});if(gm&&google.current)google.current.event.trigger(gm,'resize');fitRef.current();};
  const mapError=()=>{if(!disposed)setStatus(mode==='google'&&googleAuthFailed?'auth-error':'error');};
  if(mode==='demo'){
   import('leaflet').then(L=>{
    if(disposed||!container.current)return;leaflet.current=L;
    map=L.map(container.current,{scrollWheelZoom:false,zoomSnap:.25,minZoom:9,maxZoom:18,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false});leafletMap.current=map;
    map.fitBounds(L.latLngBounds(journeyStations.map(s=>[s.lat,s.lng])),{padding:[40,40],animate:false});
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    let failed=false;tiles.on('tileload',()=>{if(!disposed&&!failed)setStatus('ready');});tiles.on('tileerror',()=>{failed=true;mapError();});
    timer=setTimeout(()=>{if(!disposed)setStatus(s=>s==='loading'?'error':s);},15000);
    observer=new ResizeObserver(resize);observer.observe(container.current);setReady(v=>v+1);
   }).catch(mapError);
  }else{
   window.addEventListener('exitnow-google-map-error',mapError);
   const key=process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
   if(!key?.trim())setStatus('unconfigured');
   else loadGoogleMaps(key).then(G=>{
    if(disposed||!container.current)return;google.current=G;
    gm=new G.Map(container.current,{center:{lat:40.735,lng:-73.96},zoom:11,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'cooperative',styles:[{elementType:'geometry',stylers:[{color:'#e9e8df'}]},{elementType:'labels.text.stroke',stylers:[{color:'#e9e8df'}]},{elementType:'labels.text.fill',stylers:[{color:'#62645e'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#c6d2ce'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#ffffff'}]},{featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#d5d4cb'}]},{featureType:'poi.park',elementType:'geometry',stylers:[{color:'#d0d8c9'}]},{featureType:'poi',elementType:'labels.icon',stylers:[{visibility:'off'}]}]});googleMap.current=gm;
    if(googleAuthFailed){mapError();return;}
    observer=new ResizeObserver(resize);observer.observe(container.current);setReady(v=>v+1);setStatus('ready');
   }).catch(mapError);
  }
  return()=>{disposed=true;clearTimeout(timer);observer?.disconnect();window.removeEventListener('exitnow-google-map-error',mapError);map?.remove();if(gm)google.current?.event.clearInstanceListeners(gm);leafletMap.current=null;googleMap.current=null;fitRef.current=()=>{};if(container.current)container.current.replaceChildren();};
 },[mode,attempt]);
 useEffect(()=>{
  // Never expose Google geometry to a non-Google renderer, including while mode changes.
  const points:[number,number][]=active?active.routes.flatMap(r=>r.path):journeyStations.map(s=>[s.lat,s.lng]);
  const sorted=[...routes].sort((a,b)=>Number(a.id===selected?.id)-Number(b.id===selected?.id));
  if(mode==='demo'){
   const L=leaflet.current,map=leafletMap.current;if(!L||!map)return;
   const layers=L.layerGroup().addTo(map);
   for(const route of sorted){const chosen=route.id===selected?.id;
    const path=L.polyline(route.path,{color:chosen?'#c44120':'#7f8a9d',weight:chosen?6:4,opacity:chosen?1:.65}).addTo(layers);
    const label=document.createElement('span');label.textContent=`${route.title} · ${Math.ceil(route.durationMinutes)} min · synthetic`;path.bindTooltip(label);path.on('click',()=>select.current(route.id));
    if(chosen&&route.crowding==='high')L.polyline(route.path,{color:'#e78422',weight:3,opacity:1,dashArray:'8 13',interactive:false}).addTo(layers);
   }
   const stations=active?[active.origin,active.destination]:journeyStations;
   for(const station of stations){const marker=L.circleMarker([station.lat,station.lng],{radius:active?6:4,weight:2,color:'#ffffff',fillColor:active?'#c44120':'#455a70',fillOpacity:1}).addTo(layers);const label=document.createElement('span');label.textContent=station.name;marker.bindTooltip(label,{permanent:Boolean(active),direction:'top'});}
   const fit=()=>{if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[38,45],maxZoom:14,animate:false});};fitRef.current=fit;fit();return()=>{layers.remove();};
  }
  const G=google.current,map=googleMap.current;if(!G||!map)return;
  const overlays:GoogleOverlay[]=[],listeners:{remove():void}[]=[];
  for(const route of sorted){const chosen=route.id===selected?.id;const line=new G.Polyline({map,path:route.path.map(([lat,lng])=>({lat,lng})),strokeColor:chosen?'#c44120':'#7f8a9d',strokeOpacity:chosen?1:.7,strokeWeight:chosen?6:4,zIndex:chosen?2:1});overlays.push(line);listeners.push(line.addListener('click',()=>select.current(route.id)));}
  for(const station of active?[active.origin,active.destination]:[])overlays.push(new G.Marker({map,position:{lat:station.lat,lng:station.lng},title:station.name,icon:{path:G.SymbolPath.CIRCLE,scale:active?6:4,fillColor:'#c44120',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2}}));
  const fit=()=>{if(points.length){const bounds=new G.LatLngBounds();points.forEach(([lat,lng])=>bounds.extend({lat,lng}));map.fitBounds(bounds,55);}};fitRef.current=fit;fit();
  return()=>{listeners.forEach(l=>l.remove());overlays.forEach(o=>o.setMap(null));};
 },[mode,active,selected?.id,ready]);
 const mapUnavailable=mode==='google'&&(status==='unconfigured'||status==='auth-error'||status==='error');
 const directionsLink=active?`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${active.origin.lat},${active.origin.lng}`)}&destination=${encodeURIComponent(`${active.destination.lat},${active.destination.lng}`)}&travelmode=transit`:'https://www.google.com/maps';
 if(mapUnavailable)return <section className="journey-map-fallback" aria-label="Google route overview">
  <div className="journey-fallback-top"><span>Google Maps</span><span>{selected?'Your route, at a glance':'Your journey starts here'}</span></div>
  <div className="journey-fallback-main">{selected&&active?<><p>{active.origin.name}</p><h2>{Math.ceil(selected.durationMinutes)}<small> min</small></h2><p>Leave {new Date(selected.departureTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} · Arrive {new Date(selected.arrivalTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</p><div className="journey-fallback-line">{selected.steps.filter((step,i,steps)=>step.mode!=='walk'||i===0||steps[i-1].mode!=='walk').map((step,i)=><span key={i}><b style={{background:step.mode==='transit'?step.color:'#606b64'}}>{step.mode==='walk'?'↗':step.line}</b><small>{step.mode==='walk'?'Walk':step.to}</small></span>)}</div><strong>{active.destination.name}</strong></>:<><div className="journey-fallback-arrow" aria-hidden="true">↗</div><h2>From anywhere.<br/>To your next stop.</h2><p>Search an address or a place.<br/>We’ll find the transit connections.</p></>}</div>
  <div className="journey-fallback-bottom"><div><strong>{status==='unconfigured'?'Interactive map coming next.':'The map is unavailable.'}</strong><p>{selected?'Your Google estimates and directions are ready.':'Google route search works without the embedded map.'} {status==='unconfigured'?'A browser map key is still needed.':'Try opening your trip directly in Google Maps.'}</p></div><a href={directionsLink} target="_blank" rel="noopener noreferrer">{selected?'Open this trip in Google Maps':'Open Google Maps'} ↗</a></div>
  <style jsx>{`
   .journey-map-fallback{height:100%;min-height:520px;padding:27px 32px;background:#0b1e34;color:#eef8ff;display:flex;flex-direction:column;border:1px solid #42657e;border-radius:8px}
   .journey-fallback-top{display:flex;justify-content:space-between;gap:20px;font-size:12px;border-bottom:1px solid #42657e;padding-bottom:19px;color:#b4cddd}.journey-fallback-top>span:first-child{font-weight:500;color:#ecf8ff}
   .journey-fallback-main{flex:1;padding:40px 0}.journey-fallback-main h2{font:500 clamp(34px,3.3vw,52px)/1.13 'Outfit',Arial,sans-serif;letter-spacing:-2px;margin:16px 0;color:#eef8ff}.journey-fallback-main h2 small{font-size:24px;letter-spacing:-.5px}.journey-fallback-main>p{font-size:16px;line-height:1.6;color:#b4cddd;max-width:560px;overflow-wrap:anywhere}.journey-fallback-arrow{color:#c44120;font-size:60px;line-height:1}.journey-fallback-main>strong{font-size:17px;font-weight:500;display:block;margin-top:20px;overflow-wrap:anywhere}
   .journey-fallback-line{display:flex;gap:16px;margin-top:30px;overflow-x:auto;padding:3px 0 15px}.journey-fallback-line>span{display:flex;align-items:flex-start;gap:9px;max-width:160px;flex-shrink:0}.journey-fallback-line b{display:grid;place-items:center;min-width:30px;height:30px;border-radius:50%;color:white;font-size:12px;padding:0 6px;max-width:80px;overflow:hidden}.journey-fallback-line small{font-size:12px;line-height:1.5;color:#b4cddd;min-width:50px}
   .journey-fallback-bottom{border-top:1px solid #42657e;padding-top:22px;display:flex;gap:28px;justify-content:space-between;align-items:flex-end}.journey-fallback-bottom strong{font-size:13px;font-weight:500}.journey-fallback-bottom p{font-size:12px;color:#b4cddd;margin-top:7px;max-width:340px;line-height:1.5}.journey-fallback-bottom a{color:#a5edff;font-size:13px;flex-shrink:0;text-decoration:underline;text-underline-offset:5px;line-height:1.6}
   @media(max-width:700px){.journey-map-fallback{min-height:440px;padding:22px}.journey-fallback-main{padding:28px 0}.journey-fallback-main h2{font-size:38px}.journey-fallback-bottom{flex-direction:column;align-items:flex-start;gap:15px}.journey-fallback-top{font-size:11px}}
  `}</style>
 </section>;
 return <section className="journey-map" aria-label={mode==='demo'?'Synthetic NYC journey map':'Google Maps transit journey'}>
  <div key={mode} ref={container} className="journey-map-canvas" aria-label="Interactive map. Use map controls to zoom and drag to pan."/>
  {status==='loading'&&<div className="journey-map-message" role="status">Loading city map…</div>}
  {(status==='error'||status==='auth-error'||status==='unconfigured')&&<div className="journey-map-message" role="status"><strong>{status==='unconfigured'?'Google map is not configured.':status==='auth-error'?'Google Maps authorization failed.':'Map could not load.'}</strong><span>{status==='unconfigured'?'A browser Maps API key is required. Journey details remain available beside the map.':status==='auth-error'?'Check the browser key configuration, then reload the page. Journey details remain available.':'Check your connection or map configuration. Journey details remain available.'}</span>{status==='error'&&<button type="button" onClick={()=>setAttempt(n=>n+1)}>Retry map</button>}{status==='auth-error'&&<button type="button" onClick={()=>window.location.reload()}>Reload page</button>}</div>}
  <div className="journey-map-legend"><span><i className="journey-map-key"/>{mode==='demo'?'Selected demo route':active?'Selected route':'Choose your journey'}</span>{routes.length>1&&<span><i className="journey-map-key journey-map-alternative"/>Alternative</span>}{mode==='demo'&&selected?.crowding==='high'&&<span><i className="journey-map-key crowded"/>Modeled high crowding</span>}<small>{mode==='demo'?'Illustrative paths · synthetic times · no live train positions':'Google Maps · crowding unknown'}</small></div>
  {routes.length>1&&<div className="journey-map-switcher" aria-label="Select a mapped route">{routes.map((r,i)=><button key={r.id} type="button" aria-pressed={r.id===selected?.id} onClick={()=>onSelect(r.id)} aria-label={`Show route ${i+1}: ${r.title}`}>{i+1}<span>{Math.ceil(r.durationMinutes)} min</span></button>)}</div>}
  <style jsx>{`
   .journey-map{position:relative;width:100%;height:100%;min-height:400px;background:#e5e5dc;isolation:isolate;overflow:hidden}
   .journey-map-canvas{position:absolute;inset:0;min-height:400px;z-index:0}
   .journey-map-message{position:absolute;z-index:500;top:70px;left:50%;transform:translateX(-50%);width:min(85%,360px);padding:16px;background:#fff;color:#18283c;border-radius:12px;box-shadow:0 6px 24px #16315326;font-size:13px;line-height:1.5;display:grid;gap:8px}
   .journey-map-message button{justify-self:start;background:#c44120;color:#fff;border:0;border-radius:6px;padding:8px 12px;cursor:pointer}
   .journey-map-legend{position:absolute;z-index:450;bottom:30px;left:12px;right:12px;display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;max-width:fit-content;padding:10px 12px;background:#0a2036e8;color:#e4f4ff;border:1px solid #77bad955;backdrop-filter:blur(15px);box-shadow:0 3px 14px #1631531a;border-radius:9px;font-size:11px;pointer-events:none}
   .journey-map-legend span{display:flex;gap:7px;align-items:center}.journey-map-legend small{flex-basis:100%;font-size:10px;color:#62645e}
   .journey-map-key{display:block;width:20px;height:4px;background:#c44120;border-radius:2px}.journey-map-key.journey-map-alternative{background:#7f8a9d}.journey-map-key.crowded{background:#e78422}
   .journey-map-switcher{position:absolute;z-index:450;top:12px;right:12px;display:flex;gap:5px;max-width:calc(100% - 24px);overflow-x:auto}.journey-map-switcher button{flex-shrink:0;min-height:40px;border:1px solid #77bad955;background:#0a2036e8;color:#e4f4ff;border-radius:7px;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer;display:flex;gap:7px;align-items:center}.journey-map-switcher button[aria-pressed=true]{background:#baf45e;color:#102408;border-color:#d7ff79}.journey-map-switcher span{font-size:11px}.journey-map button:focus-visible{outline:3px solid #102f53;outline-offset:3px}.journey-map-switcher button:hover{filter:brightness(.95)}
  `}</style>
 </section>;
}
