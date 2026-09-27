/** Official GTFS reference coordinates, retrieved 2026-09-26. See public/map-data.json provenance. */
export type MapPosition=[number,number];
export const MAP_STATIONS:{id:string;gtfsStopId:string;name:string;position:MapPosition}[]=[
 {id:'columbia',gtfsStopId:'117',name:'116 St–Columbia University',position:[40.807722,-73.964110]},
 {id:'times-square',gtfsStopId:'127',name:'Times Sq–42 St',position:[40.755290,-73.987495]},
 {id:'union-square',gtfsStopId:'635',name:'14 St–Union Sq',position:[40.734673,-73.989951]},
 {id:'williamsburg',gtfsStopId:'L08',name:'Bedford Av',position:[40.717304,-73.956872]},
 {id:'queens',gtfsStopId:'719',name:'Court Sq',position:[40.747023,-73.945264]},
 {id:'brooklyn',gtfsStopId:'A42',name:'Hoyt–Schermerhorn Sts',position:[40.688484,-73.985001]},
];
export function corridorStationIds(selected:string){return selected==='queens-brooklyn'?['queens','williamsburg','brooklyn']:selected==='manhattan-brooklyn'?['times-square','brooklyn']:[];}
/** Links convey station order only, never track alignment or real train position. */
export function journeyConnections(legs:readonly {from:string;to:string;line:string}[]){return legs.flatMap(leg=>{const from=MAP_STATIONS.find(s=>s.id===leg.from),to=MAP_STATIONS.find(s=>s.id===leg.to);return from&&to?[{kind:'station_connection' as const,approximate:true as const,line:leg.line,positions:[from.position,to.position]}]:[];});}
export interface MapGeometry {kind:'static_reference';source:string;retrievedAt:string;lines:{line:string;shapeId:string;color:string;coordinates:MapPosition[]}[]}
export function parseMapGeometry(value:unknown):MapGeometry{
 const data=value as MapGeometry;
 if(!data||data.kind!=='static_reference'||typeof data.source!=='string'||!data.source.startsWith('https://rrgtfsfeeds.s3.amazonaws.com/')||!Array.isArray(data.lines)||!data.lines.length||data.lines.length>100)throw new Error('Invalid map geometry');
 for(const line of data.lines){if(typeof line.line!=='string'||typeof line.shapeId!=='string'||!Array.isArray(line.coordinates)||line.coordinates.length<2||line.coordinates.length>20000||!line.coordinates.every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>40&&p[0]<42&&p[1]>-75&&p[1]<-73))throw new Error('Invalid map geometry');}
 return data;
}
