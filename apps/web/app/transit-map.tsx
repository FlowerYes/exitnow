'use client';

import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import {Layers,LocateFixed,Minus,Plus,RefreshCw} from 'lucide-react';
import type {RoutePlan} from '../../../packages/core/src/index';
import {MAP_STATIONS,corridorStationIds,journeyConnections,parseMapGeometry,type MapGeometry} from '../../../packages/core/src/map-data';
import 'leaflet/dist/leaflet.css';
import './transit-map.css';

export interface TransitMapProps {
 mode?:'journey'|'network';
 origin?:string;
 destination?:string;
 journey?:RoutePlan['recommended']|null;
 selected?:string;
 onSelect?:(corridor:string)=>void;
 showLines?:boolean;
}

export default function TransitMap({mode='network',origin,destination,journey,selected='queens-brooklyn',onSelect,showLines=true}:TransitMapProps){
 const container=useRef<HTMLDivElement>(null);
 const map=useRef<Leaflet.Map|null>(null);
 const library=useRef<typeof Leaflet|null>(null);
 const [ready,setReady]=useState(0);
 const [attempt,setAttempt]=useState(0);
 const [tileState,setTileState]=useState<'loading'|'ready'|'error'>('loading');
 const [geometry,setGeometry]=useState<MapGeometry|null>(null);
 const [geometryError,setGeometryError]=useState(false);
 const [linesVisible,setLinesVisible]=useState(showLines);
 const [stationSelected,setStationSelected]=useState<string|null>(null);
 const selectRef=useRef(onSelect);selectRef.current=onSelect;
 useEffect(()=>setLinesVisible(showLines),[showLines]);
 useEffect(()=>{
  const abort=new AbortController();setGeometryError(false);
  fetch('/map-data.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Map reference unavailable');return r.json();}).then(parseMapGeometry).then(setGeometry).catch(()=>{if(!abort.signal.aborted)setGeometryError(true);});
  return()=>abort.abort();
 },[attempt]);
 useEffect(()=>{
  let disposed=false;let instance:Leaflet.Map|undefined;let resize:ResizeObserver|undefined;let timeout:ReturnType<typeof setTimeout>|undefined;
  setTileState('loading');
  import('leaflet').then(L=>{
   if(disposed||!container.current)return;
   library.current=L;
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   instance=L.map(container.current,{zoomControl:false,scrollWheelZoom:false,minZoom:10,maxZoom:18,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:!reduced});
   map.current=instance;
   instance.fitBounds(L.latLngBounds(MAP_STATIONS.map(s=>s.position)),{padding:[42,42],animate:false});
   const tiles=L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:process.env.NEXT_PUBLIC_MAP_ATTRIBUTION||'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',maxZoom:19,updateWhenIdle:true,
   });
   let failures=0;
   tiles.on('tileload',()=>{if(!disposed&&failures===0)setTileState('ready');});
   tiles.on('tileerror',()=>{failures++;if(!disposed)setTileState('error');});
   tiles.addTo(instance);
   L.control.scale({position:'bottomleft',imperial:false}).addTo(instance);
   timeout=setTimeout(()=>{if(!disposed)setTileState(state=>state==='loading'?'error':state);},15000);
   resize=new ResizeObserver(()=>{instance?.invalidateSize({pan:false});if(!disposed)setReady(n=>n+1);});resize.observe(container.current);
   setReady(n=>n+1);
  }).catch(()=>{if(!disposed)setTileState('error');});
  return()=>{disposed=true;clearTimeout(timeout);resize?.disconnect();instance?.remove();map.current=null;};
 },[attempt]);
 useEffect(()=>{
  const L=library.current,instance=map.current;if(!L||!instance)return;
  const layers=L.layerGroup().addTo(instance);
  const activeLines=new Set(journey?.legs.map(l=>l.line)||[]);
  if(linesVisible&&geometry)for(const line of geometry.lines){
   const active=mode==='journey'&&activeLines.has(line.line);
   L.polyline(line.coordinates,{color:active?'#245343':'#607b6b',weight:active?3.5:1.6,opacity:active?.82:.44,interactive:false}).addTo(layers);
  }
  if(mode==='network'){
   for(const corridor of ['queens-brooklyn','manhattan-brooklyn']){
    const points=corridorStationIds(corridor).flatMap(id=>{const station=MAP_STATIONS.find(s=>s.id===id);return station?[station.position]:[];});
    const selectedCorridor=selected===corridor;
    const path=L.polyline(points,{color:selectedCorridor?'#2d4d35':'#65745f',weight:selectedCorridor?4:2.5,dashArray:'7 9',opacity:selectedCorridor?.9:.55}).addTo(layers);
    path.on('click',()=>selectRef.current?.(corridor));
    const label=document.createElement('span');label.textContent='Illustrative demand corridor · not subway tracks';path.bindTooltip(label);
   }
  }else if(journey){
   for(const link of journeyConnections(journey.legs))L.polyline(link.positions,{color:'#233f32',weight:3,dashArray:'5 8',opacity:.7,interactive:false}).addTo(layers);
  }
  for(const station of MAP_STATIONS){
   const chosen=station.id===origin||station.id===destination||station.id===stationSelected;
   const marker=L.marker(station.position,{keyboard:true,title:station.name,alt:station.name,icon:L.divIcon({className:'exitnow-station-icon',html:`<span class="exitnow-station-dot${chosen?' is-selected':''}"></span>`,iconSize:[24,24],iconAnchor:[12,12]})}).addTo(layers);
   const label=document.createElement('span');label.textContent=station.name;
   const narrow=window.matchMedia('(max-width:640px)').matches;
   marker.bindTooltip(label,{permanent:!narrow||chosen,direction:narrow?'bottom':'right',offset:narrow?[0,10]:[9,0],className:'exitnow-station-label'});
   marker.on('click',()=>setStationSelected(station.id));
  }
  return()=>{layers.remove();};
 },[ready,geometry,linesVisible,mode,selected,origin,destination,journey,stationSelected]);
 useEffect(()=>{
  const L=library.current,instance=map.current;if(!L||!instance)return;
  const ids=mode==='journey'?(journey?[origin,destination,...journey.legs.flatMap(l=>[l.from,l.to])]:MAP_STATIONS.map(s=>s.id)):corridorStationIds(selected);
  const points=MAP_STATIONS.filter(s=>ids.includes(s.id)).map(s=>s.position);
  if(points.length>=2)instance.fitBounds(L.latLngBounds(points),{padding:[65,65],maxZoom:13,animate:false});
 },[ready,mode,origin,destination,journey,selected]);
 const selectedStation=MAP_STATIONS.find(s=>s.id===stationSelected);
 const fit=()=>{const L=library.current;if(L&&map.current)map.current.fitBounds(L.latLngBounds(MAP_STATIONS.map(s=>s.position)),{padding:[42,42],animate:false});};
 return <section className="geographic-map" aria-label="Interactive New York City station map">
  <div ref={container} className="geographic-map-canvas" aria-label="Geographic map. Use arrow keys to pan, plus and minus keys to zoom."/>
  <div className="geographic-map-controls" aria-label="Map controls">
   <button type="button" onClick={()=>map.current?.zoomIn()} aria-label="Zoom in"><Plus size={18}/></button>
   <button type="button" onClick={()=>map.current?.zoomOut()} aria-label="Zoom out"><Minus size={18}/></button>
   <button type="button" onClick={fit} aria-label="Show all supported stations"><LocateFixed size={18}/></button>
  </div>
  <button type="button" className="geographic-map-layers" aria-pressed={linesVisible} onClick={()=>setLinesVisible(v=>!v)}><Layers size={15}/>{linesVisible?'Hide subway lines':'Show subway lines'}</button>
  {tileState==='loading'&&<div className="geographic-map-loading" role="status">Loading city map…</div>}
  {tileState==='error'&&<div className="geographic-map-error" role="status"><strong>Map tiles are unavailable.</strong><span>Station locations remain available. Check your connection and retry.</span><button type="button" onClick={()=>setAttempt(v=>v+1)}><RefreshCw size={14}/>Retry map</button></div>}
  <div className="geographic-map-caption"><span><i className="map-key-solid"/>MTA static line geometry</span>{(mode==='network'||journey)&&<span><i className="map-key-dashed"/>{mode==='network'?'Illustrative demand corridor':'Station sequence · approximate links'}</span>}<small>Service may vary. No live train positions.</small>{geometryError&&<span role="status">Subway geometry unavailable.</span>}</div>
  {selectedStation&&<div className="geographic-map-station-detail"><strong>{selectedStation.name}</strong><span>Official MTA station reference · {selectedStation.gtfsStopId}</span><button type="button" onClick={()=>setStationSelected(null)}>Close</button></div>}
  <details className="geographic-map-stations" open={tileState==='error'||undefined}><summary>Six supported stations</summary><ul>{MAP_STATIONS.map(s=><li key={s.id}><button type="button" onClick={()=>{setStationSelected(s.id);map.current?.setView(s.position,14,{animate:false});}}>{s.name}</button></li>)}</ul></details>
 </section>;
}
