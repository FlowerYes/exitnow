import {writeFile} from 'node:fs/promises';
import {ingestGtfsZip,OFFICIAL_SUPPLEMENTED_GTFS} from './ingest.ts';
const [source=OFFICIAL_SUPPLEMENTED_GTFS,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node --import tsx packages/core/src/ingest-cli.ts <official URL or local ZIP> <output.json>');
const data=await ingestGtfsZip(source);await writeFile(output,JSON.stringify(data));
console.log(JSON.stringify({source:data.source,counts:Object.fromEntries(Object.entries(data.tables).map(([k,v])=>[k,v.length])),output},null,2));
