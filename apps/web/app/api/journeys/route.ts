import {z} from 'zod';
import {fetchGoogleJourneys,JourneyError,journeyStations,planDemoJourney} from '../../../../../packages/core/src/journey-v2.ts';
import geometry from '../../../public/map-data.json';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
const schema=z.object({origin:z.string().trim().min(1).max(500),destination:z.string().trim().min(1).max(500),mode:z.enum(['google','demo']),demoCrowding:z.enum(['typical','rush-hour']).default('typical'),preferFewerTransfers:z.boolean().default(false)}).strict();
export async function GET(){return Response.json({stations:journeyStations,googleConfigured:Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),browserMapsConfigured:Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())},{headers});}
export async function POST(request:Request){
 let body:unknown;
 try{const raw=await request.text();if(raw.length>4096)return Response.json({error:'Trip request is too large.'},{status:413,headers});body=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON trip request.'},{status:400,headers});}
 const parsed=schema.safeParse(body);if(!parsed.success)return Response.json({error:'Enter valid locations, a routing mode and transfer preference.'},{status:400,headers});
 try{const input=parsed.data;const result=input.mode==='demo'?planDemoJourney({...input,geometry,peakOverride:input.demoCrowding==='rush-hour'}):await fetchGoogleJourneys({...input,apiKey:process.env.GOOGLE_MAPS_API_KEY??''});return Response.json(result,{headers});}
 catch(error){return Response.json({error:error instanceof JourneyError?error.message:'Journey planning is unavailable. Please try again.'},{status:error instanceof JourneyError?error.status:503,headers});}
}
