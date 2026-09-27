import {ArrowUpRight} from 'lucide-react';
import './editorial-system.css';
export default function SiteNav({active,overlay=false}:{active?:'planner'|'live'|'rewards';overlay?:boolean}){
 return <header className={`editorial-nav${overlay?' editorial-nav-overlay':''}`}>
  <a href="/" className="editorial-brand" aria-label="ExitNow home">ExitNow<span>↗</span></a>
  <nav aria-label="Main navigation">{([{id:'planner',href:'/app',label:'Trip planner'},{id:'live',href:'/live',label:'Live departures'},{id:'rewards',href:'/rewards',label:'Rewards'},{id:'report',href:'/rewards#report',label:'Report a problem'}] as const).map(link=><a key={link.id} href={link.href} aria-current={active===link.id?'page':undefined}>{link.label}</a>)}</nav>
  <a href={active==='planner'?'/live':'/app'} className="editorial-nav-cta">{active==='planner'?'Next trains':'Let’s go'}<ArrowUpRight size={17}/></a>
 </header>
}
