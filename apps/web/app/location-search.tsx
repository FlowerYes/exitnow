'use client';

import {useEffect, useRef, useState} from 'react';
import {MapPin, X} from 'lucide-react';
import {z} from 'zod';

const placesSchema = z.object({places:z.array(z.object({id:z.string(),name:z.string(),address:z.string(),lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)})),attribution:z.literal('Google Maps')});
type Place = z.infer<typeof placesSchema>['places'][number];

export default function LocationSearch({id,label,value,onChange,disabled=false}:{id:string;label:string;value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const [places,setPlaces]=useState<Place[]>([]);
  const [focused,setFocused]=useState(false);
  const [active,setActive]=useState(-1);
  const [status,setStatus]=useState('');
  const [searchable,setSearchable]=useState(false);
  const request=useRef<AbortController|null>(null);
  const input=useRef<HTMLInputElement|null>(null);
  const show=focused&&searchable&&value.trim().length>=3;
  useEffect(()=>{
    request.current?.abort();
    setPlaces([]);setActive(-1);setStatus('');
    if(!show||disabled)return;
    const controller=new AbortController();request.current=controller;
    const timer=setTimeout(async()=>{
      setStatus('Searching places…');
      try{
        const response=await fetch(`/api/places?q=${encodeURIComponent(value.trim())}`,{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw new Error();
        const parsed=placesSchema.safeParse(await response.json());
        if(!parsed.success)throw new Error();
        if(!controller.signal.aborted){setPlaces(parsed.data.places);setStatus(parsed.data.places.length?'':'No suggestions. You can use this address as typed.');}
      }catch{if(!controller.signal.aborted)setStatus('Suggestions unavailable. You can still enter an address.');}
    },280);
    return()=>{clearTimeout(timer);controller.abort();};
  },[value,show,disabled]);
  function choose(place:Place){request.current?.abort();setSearchable(false);setPlaces([]);setActive(-1);onChange(place.address||place.name);input.current?.focus();}
  return <div className="planner-location">
    <label htmlFor={id}>{label}</label>
    <div className="planner-location-input">
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={`${id}-suggestions`} aria-activedescendant={show&&active>=0?`${id}-option-${active}`:undefined} aria-describedby={`${id}-hint`} autoComplete="off" value={value} disabled={disabled} maxLength={300} placeholder={label==='From'?'Address or starting place':'Where are you going?'} onChange={event=>{request.current?.abort();setPlaces([]);setActive(-1);setSearchable(true);onChange(event.target.value);}} onFocus={()=>setFocused(true)} onBlur={()=>{setFocused(false);setActive(-1);}} onKeyDown={event=>{
        if(event.key==='Escape'){setSearchable(false);setActive(-1);return;}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setSearchable(true);if(places.length)setActive(current=>event.key==='ArrowDown'?(current+1)%places.length:(current<=0?places.length-1:current-1));}
        if(event.key==='Enter'&&show&&active>=0&&places[active]){event.preventDefault();choose(places[active]);}
      }}/>
      {value&&<button type="button" className="planner-clear" aria-label={`Clear ${label.toLowerCase()} location`} disabled={disabled} onClick={()=>{request.current?.abort();setSearchable(false);setPlaces([]);onChange('');input.current?.focus();}}><X size={16}/></button>}
    </div>
    <span id={`${id}-hint`} className="planner-sr">Enter any address or place. Use arrow keys to explore suggestions, or submit your own text.</span>
    {show&&<div className="planner-suggestions">
      <ul id={`${id}-suggestions`} role="listbox" aria-label={`${label} suggestions`}>{places.map((place,index)=><li id={`${id}-option-${index}`} role="option" aria-selected={active===index} key={place.id} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(place)}><MapPin size={16}/><span><strong>{place.name}</strong><small>{place.address}</small></span></li>)}</ul>
      {status&&<p role="status">{status}</p>}
      <span className="planner-google-attribution">Google Maps</span>
    </div>}
  </div>;
}
