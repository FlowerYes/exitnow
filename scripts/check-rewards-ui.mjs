import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[];
const actions=[];
page.on('pageerror',error=>errors.push(error.message));
const base=process.env.APP_URL||'http://127.0.0.1:3001';
const wallet='FixtureWalletOnly11111111111111111111111111111';
const receipt='https://explorer.solana.com/tx/fixture-only-not-a-real-transaction?cluster=devnet';
// Every rewards API call is intercepted. These fixtures never access a real
// account, fund a campaign, sign a transaction, or submit a moderator decision.
const fixture={
  reports:[{id:'fixture-report',station:'columbia',category:'elevator_status',condition:'working',status:'reward_eligible',reason:'Fixture moderator accepted supporting evidence',amount:600000,earnedAmount:600000,verificationStatus:'disputed',rewardStatus:'reward_eligible',calculation:{coverage:0,target:3,baseReward:500000,bounty:1000000,gapNumerator:3,gapDenominator:3,formulaVersion:'coverage-v1',slots:[600000,200000,200000]},slot:0,expiresAt:Date.now()+600000,observedAt:Date.now(),asset:'Fixture elevator',evidenceRefs:['fixture:inspection']}],
  wallet,earnedBalance:600000,claimableBalance:600000,payouts:[],threshold:100000,
  samplingWarning:'Rewards influence reporting; not unbiased transit demand.',
  accounting:{allocatedFunding:1000000,activeReservations:400000,committedUnpaid:600000,settled:0},
  metrics:{usableObservations:1,guidanceChanges:1,rewardSpend:600000},
  tasks:[{id:'fixture-task',station:'columbia',category:'elevator_status',bounty:1000000,coverageCount:0,expiresAt:Date.now()+600000}],
};
let expireNext=false;
let failNextClaim=true;
await page.route('**/api/rewards*',async route=>{
  const request=route.request();
  if(request.headers().authorization==='Bearer invalid'||expireNext){
    expireNext=false;
    await route.fulfill({status:401,json:{error:'Fixture access expired'}});
    return;
  }
  if(request.method()==='GET'){
    await route.fulfill({json:fixture});
    return;
  }
  const action=request.postDataJSON();
  actions.push(action);
  if(action.action==='claim'){
    if(failNextClaim){
      failNextClaim=false;
      await route.fulfill({status:400,json:{error:'Fixture payout unavailable. Try again.'}});
      return;
    }
    fixture.claimableBalance=0;
    fixture.payouts=[{id:'fixture-payout-original',amount:600000,status:'submitted'}];
    await route.fulfill({status:202,json:{id:'fixture-payout-original',status:'submitted'}});
  }else if(action.action==='reconcile'){
    fixture.payouts[0]={...fixture.payouts[0],status:'finalized',receipt};
    await route.fulfill({json:{id:'fixture-payout-original',status:'finalized',receipt}});
  }else if(action.action==='review'){
    await route.fulfill({json:{accepted:true}});
  }else{
    errors.push(`Unexpected fixture action: ${action.action}`);
    await route.fulfill({status:400,json:{error:'Unexpected fixture action'}});
  }
});
const assertNoOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

try{
  await page.goto(base);
  await page.getByRole('button',{name:'Rider Rewards',exact:true}).click();
  await page.getByRole('heading',{name:'Good rides. Better together.'}).waitFor();
  await page.screenshot({path:'artifacts/rewards-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/rewards-mobile.png',fullPage:true});
  await assertNoOverflow();

  await page.getByLabel('Private access code').fill('invalid');
  await page.getByRole('button',{name:'View my rewards'}).click();
  await expect(page.getByRole('alert')).toContainText('expired or is invalid');
  await expect(page.getByLabel('Private access code')).toHaveValue('');
  // A 401 clears the token, so authentication requires a fresh code.
  await page.getByLabel('Private access code').fill('fixture-only');
  await page.getByRole('button',{name:'View my rewards'}).click();
  await page.getByRole('heading',{name:/test USDC available/}).waitFor();
  await page.locator('.reward-observation > summary').first().click();
  await page.getByText('Why this amount?',{exact:true}).click();
  await page.screenshot({path:'artifacts/rewards-fixture-mobile.png',fullPage:true});
  await assertNoOverflow();

  const claim={action:'claim',expectedAmount:600000,expectedWallet:wallet};
  await page.getByRole('button',{name:'Receive 0.6 test USDC',exact:true}).click();
  await expect(page.getByRole('region',{name:'Confirm payout'})).toContainText(wallet);
  assert.equal(actions.length,0,'Opening confirmation must not submit a payout');
  await page.getByRole('button',{name:'Confirm payout',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Fixture payout unavailable');
  assert.deepEqual(actions,[claim]);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Open transaction receipt'})).toHaveCount(0);

  // Successful eligible flow takes two clicks; the first request failed without
  // reserving funds. The retry must carry the exact confirmed balance/wallet.
  await page.getByRole('button',{name:'Receive 0.6 test USDC',exact:true}).click();
  await page.getByRole('button',{name:'Confirm payout',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('in progress');
  assert.deepEqual(actions,[claim,claim]);
  await expect(page.getByText('Your test USDC payout is complete.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Open transaction receipt'})).toHaveCount(0);
  await page.getByRole('button',{name:'Continue payout',exact:true}).first().click();
  await expect(page.getByRole('status')).toHaveText('Your test USDC payout is complete.');
  assert.deepEqual(actions,[claim,claim,{action:'reconcile',payoutId:'fixture-payout-original'}]);
  await expect(page.getByRole('link',{name:'Open transaction receipt'})).toHaveAttribute('href',receipt);
  await expect(page.getByRole('button',{name:'Continue payout',exact:true})).toHaveCount(0);
  await page.screenshot({path:'artifacts/rewards-payout-fixture-mobile.png',fullPage:true});
  await assertNoOverflow();

  expireNext=true;
  await page.getByRole('button',{name:'Refresh balance',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('expired or is invalid');
  await expect(page.getByLabel('Private access code')).toHaveValue('');
  await expect(page.getByRole('heading',{name:/test USDC available/})).toHaveCount(0);
  await page.getByLabel('Private access code').fill('fixture-renewed');
  await page.getByRole('button',{name:'View my rewards'}).click();
  await page.getByRole('heading',{name:/test USDC available/}).waitFor();

  await page.setViewportSize({width:1440,height:1000});
  fixture.reports.push({...fixture.reports[0],id:'fixture-report-2',asset:'Fixture second elevator',earnedAmount:0,verificationStatus:'pending',rewardStatus:'pending'});
  await page.goto(base+'/rewards/review');
  await page.getByLabel('Moderator credential').fill('fixture-only');
  await page.getByRole('button',{name:'Open review queue'}).click();
  await page.getByRole('heading',{name:'Observation review queue'}).waitFor();
  await expect(page.getByRole('button',{name:'Accept with evidence'}).first()).toBeDisabled();
  await page.getByLabel('Evidence reference for Fixture elevator',{exact:true}).fill('fixture:independent');
  await page.getByLabel('Decision rationale for Fixture elevator',{exact:true}).fill('Fixture evidence establishes status.');
  await expect(page.getByRole('button',{name:'Accept with evidence'}).first()).toBeEnabled();
  await expect(page.getByRole('button',{name:'Accept with evidence'}).nth(1)).toBeDisabled();
  await page.getByRole('button',{name:'Accept with evidence'}).first().click();
  await expect(page.getByLabel('Evidence reference for Fixture elevator',{exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:'Accept with evidence'}).first()).toBeDisabled();
  assert.deepEqual(actions.at(-1),{action:'review',reportId:'fixture-report',decision:'accept',reference:'fixture:independent',reason:'Fixture evidence establishes status.'});
  await page.screenshot({path:'artifacts/review-fixture-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/review-fixture-mobile.png',fullPage:true});
  await assertNoOverflow();

  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base);
  await page.getByRole('button',{name:'Network',exact:true}).click();
  await page.screenshot({path:'artifacts/network-rewards-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Operations',exact:true}).click();
  await page.getByRole('button',{name:'Run journey replay'}).click();
  await page.getByText('Route calculation:',{exact:false}).waitFor();
  await page.screenshot({path:'artifacts/operations-rewards-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({errors,overflow:false,fixtureScreenshots:true,claimConfirmation:true,samePayoutReconciliation:true,payoutFailure:true,accessRenewal:true,moderatorIsolation:true}));
}finally{
  await browser.close();
}
