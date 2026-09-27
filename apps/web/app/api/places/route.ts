export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
/** Server-only place lookup. Typed addresses can also go straight to /api/journeys. */
export async function GET(request:Request){
 const query=new URL(request.url).searchParams.get('q')?.trim()??'';
 if(query.length<3||query.length>500)return Response.json({error:'Enter a place or address between 3 and 500 characters.'},{status:400,headers});
 const key=process.env.GOOGLE_MAPS_API_KEY?.trim();
 if(!key)return Response.json({error:'Place search is not configured. You can still enter an address.'},{status:503,headers});
 try{
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location'},body:JSON.stringify({textQuery:query,pageSize:5,languageCode:'en',regionCode:'US',locationBias:{circle:{center:{latitude:40.75,longitude:-73.98},radius:50000}}})});
  if(!response.ok)return Response.json({error:'Google place search is unavailable. Enter a complete address to plan your trip.'},{status:502,headers});
  const raw=await response.text();if(raw.length>250000)throw new Error('Oversized response');
  const body=JSON.parse(raw);if(body.places!==undefined&&!Array.isArray(body.places))throw new Error('Invalid places');
  const places=(body.places??[]).slice(0,5).map((place:{id?:unknown;displayName?:{text?:unknown};formattedAddress?:unknown;location?:{latitude?:unknown;longitude?:unknown}})=>{
   const {id,displayName,formattedAddress:address,location}=place,lat=location?.latitude,lng=location?.longitude;
   if(typeof id!=='string'||typeof displayName?.text!=='string'||typeof address!=='string'||typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw new Error('Invalid place');
   return {id,name:displayName.text,address,lat,lng};
  });
  return Response.json({places,attribution:'Google Maps'},{headers});
 }catch{return Response.json({error:'Google place search could not be read. Enter a complete address to plan your trip.'},{status:502,headers});}
}
