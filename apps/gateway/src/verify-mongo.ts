import {MongoClient} from 'mongodb';
import {MongoStore} from './store.ts';
import {ingestObservation,frictionPipeline} from './observations.ts';
if(!process.env.MONGODB_URI)throw Error('MONGODB_URI required for an actual MongoDB query');
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000,connectTimeoutMS:10000});
try{await client.connect();const db=client.db(process.env.MONGODB_DB??'exitnow');const store=new MongoStore(client,db.databaseName);await store.initialize();await store.transaction(()=>true);
for(let i=0;i<8;i++)await ingestObservation(db,{eventId:`synthetic-demo-20260926-${i}`,observedAt:new Date(`2026-09-26T22:${String(i).padStart(2,'0')}:00Z`),corridor:'Queens → North Brooklyn',evidenceType:'synthetic',excessWaitMinutes:[4,8,6,12,7,5,9,5][i],analyticsConsent:false,source:'ExitNow reproducible synthetic fixture'});
const rows=await db.collection('journey_events').aggregate(frictionPipeline(new Date('2026-09-26T00:00:00Z'),new Date('2026-09-27T00:00:00Z'))).toArray();console.log(JSON.stringify({evidence:'Synthetic events ingested and aggregated on configured MongoDB. Not live rider observations.',minimumCohort:5,rows},null,2));
}finally{await client.close();}
