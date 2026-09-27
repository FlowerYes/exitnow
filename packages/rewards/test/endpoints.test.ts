import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GET,POST} from '../../../apps/web/app/api/rewards/route.ts';
test('rewards and moderator APIs fail closed before database or payout initialization',async()=>{const request=new Request('http://localhost/api/rewards');assert.equal((await GET(request)).status,401);assert.equal((await GET(new Request('http://localhost/api/rewards?review=1'))).status,401);assert.equal((await POST(new Request('http://localhost/api/rewards',{method:'POST',body:JSON.stringify({action:'claim',accountId:'victim'})}))).status,401)});
