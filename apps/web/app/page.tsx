'use client';
import {useRef,useState} from 'react';
import {useGSAP} from '@gsap/react';
import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {ArrowUpRight,ArrowRight,ArrowDown,Pause,Play} from 'lucide-react';

import './editorial-home.css';
gsap.registerPlugin(useGSAP,ScrollTrigger);
const experiences=[
 {title:'Find your way.',image:'transit',href:'/app',action:'Plan a journey',body:'Your front door. A favorite place. Somewhere entirely new. Compare transit routes and make your next move.'},
 {title:'Catch the next one.',image:'city',href:'/live',action:'See departures',body:'Official MTA predictions, clearly presented. See what’s coming at your station before you head out.'},
 {title:'Move the city forward.',image:'riders',href:'/research',action:'Explore city insights',body:'See where journeys slow down. Explore a synthetic picture of subway bottlenecks and the improvements that could help.'},
];
export default function Home(){
 const root=useRef<HTMLDivElement>(null);
 const [active,setActive]=useState(0),[paused,setPaused]=useState(false);
 useGSAP(()=>{
  const mm=gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)',()=>{
   if(paused)return;
   gsap.to('.e-hero-photo',{scale:1.1,ease:'none',scrollTrigger:{trigger:'.e-hero',start:'top top',end:'bottom top',scrub:1}});
   gsap.fromTo('.e-gallery',{scale:.94},{scale:1,ease:'none',scrollTrigger:{trigger:'.e-gallery',start:'top bottom',end:'top 20%',scrub:1}});
   gsap.to('.e-gallery-photo',{opacity:.35,ease:'none',scrollTrigger:{trigger:'.e-gallery',start:'bottom 35%',end:'bottom top',scrub:1}});
   const wide=gsap.matchMedia();
   wide.add('(min-width: 1000px)',()=>{ScrollTrigger.create({trigger:'.e-experience',start:'top 24px',end:'bottom 80%',pin:'.e-gallery-intro',pinSpacing:false})});
   return()=>wide.revert();
  });
  return()=>mm.revert();
 },{scope:root,dependencies:[paused],revertOnUpdate:true});
 return <div ref={root} className={`editorial-home${paused?' is-paused':''}`}>
  <a className="e-skip" href="#experience">Skip introduction</a>
  <header className="hero-nav"><a className="hero-brand" href="/">ExitNow</a><nav aria-label="Main navigation"><a href="/app">Trip planner</a><a href="/live">Live departures</a><a href="/rewards">Rewards</a></nav></header>
  <main>
   <section className="e-hero" aria-labelledby="hero-title">
    <img className="e-hero-photo" src="/images/editorial-hero-matched.png" alt="" width="1536" height="1024" fetchPriority="high"/>
    <div className="e-hero-wash"/>
    <div className="e-hero-copy"><h1 id="hero-title">New York.<br/>On your terms.</h1><p>A clearer route. A better ride.</p><div className="e-actions"><a className="e-button" href="/app">Find my route <ArrowRight size={20}/></a><a className="e-button e-button-dark" href="/live">Live departures <ArrowRight size={20}/></a></div></div>
    <div className="e-hero-foot"><a href="#experience"><span>34TH STREET. NEW YORK, NY<br/>A BRIGHTER CITY MOVES TOGETHER.</span></a><button type="button" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'Resume motion':'Pause motion'}</button></div>
   </section>
   <section className="e-experience" id="experience" aria-labelledby="experience-title">
    <div className="e-gallery-intro"><h2 id="experience-title">More city.<span className="e-inline-photo" aria-hidden="true"/><br/>Less friction.</h2><p>There’s a whole city out there.<br/>Let’s get you into it.</p></div>
    <div className="e-gallery" style={{gridTemplateColumns:experiences.map((_,i)=>active===i?'2fr':'1fr').join(' ')}}>
     {experiences.map((item,i)=><article key={item.href} className={`e-feature${active===i?' is-active':''}`} onMouseEnter={()=>{if(window.matchMedia('(hover:hover)').matches)setActive(i)}}>
      <img className="e-gallery-photo" src={`/images/editorial-${item.image}.webp`} alt="" width="1536" height="1024" loading="lazy"/>
      <div className="e-feature-wash"/>
      <div className="e-feature-copy"><h3><button type="button" aria-expanded={active===i} aria-controls={`experience-${i}`} onClick={()=>setActive(i)}>{item.title}<ArrowUpRight size={24}/></button></h3><div id={`experience-${i}`} hidden={active!==i}><p>{item.body}</p><a href={item.href}>{item.action}<ArrowRight size={20}/></a></div></div>
     </article>)}
    </div>
    <div className="e-gallery-caption"><span>A route. A departure. A shared observation.</span><span>One city, more possibilities.</span></div>
   </section>
   <div className="e-marquee" aria-hidden="true"><div>{[0,1].map(i=><span key={i}>LESS GUESSWORK <i>↗</i> MORE NEW YORK <i>↗</i> </span>)}</div></div>
   <section className="e-finale"><h2>Go make<br/>the city yours.</h2><div><p>A clearer route to wherever life takes you.</p><a className="e-button" href="/app">Find my route <ArrowUpRight size={22}/></a></div></section>
   <footer className="e-footer"><a className="e-footer-brand" href="/">ExitNow ↗</a><nav aria-label="Footer navigation"><a href="/app">Trip planner</a><a href="/live">Live departures</a><a href="/rewards">Rewards</a><a href="/research">City insights</a><a href="/setup">Data & setup</a><a href="/operations">Messaging demo</a></nav><div><span>Built at DivHacks · New York</span><span>Generated editorial imagery · Not live train tracking</span></div></footer>
  </main>
 </div>
}
