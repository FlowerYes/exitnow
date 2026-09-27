import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST as assumptions} from '../../../apps/web/app/api/assumptions/route.js';
const token='operator-test-token-with-more-than-32-characters';
const req=(body:unknown,auth=token)=>new Request('http://localhost/api/assumptions',{method:'POST',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json'},body:JSON.stringify(body)});
test('operator endpoints deny unauthorized requests before any provider setup',async()=>{process.env.PLANNER_API_TOKEN=token;assert.equal((await assumptions(req({documents:[]},'wrong'))).status,401)});
test('assumptions rejects duplicate source IDs before external extraction',async()=>{process.env.PLANNER_API_TOKEN=token;assert.equal((await assumptions(req({documents:[{id:'x',text:'one'},{id:'x',text:'two'}]}))).status,400)});
