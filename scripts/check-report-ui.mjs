import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const fixture={reports:[],earnedBalance:0,claimableBalance:0,payouts:[],threshold:100000,samplingWarning:'Fixture'};
const actions=[];let fail=true;
await page.route('**/api/rewards*',async route=>{
 const req=route.request();if(req.method()==='GET')return route.fulfill({json:fixture});
 const data=req.postDataJSON();actions.push(data);
 if(data.action==='prepare_report')return route.fulfill({json:{funded:false,amount:0,reason:'Fixture: no funded slot'}});
 if(data.action==='submit_report'){
  if(fail){fail=false;return route.fulfill({status:503,json:{error:'Fixture interrupted response; retry submission.'}})}
  return route.fulfill({json:{id:'fixture-report',status:'pending',amount:0}});
 }
 throw Error('Unexpected action');
});
try{
 await page.goto((process.env.APP_URL||'http://127.0.0.1:3000')+'/rewards');
 await expect(page.getByRole('link',{name:'Report a problem',exact:true})).toHaveAttribute('href','/rewards#report');
 await expect(page.getByRole('heading',{name:'Report a problem',exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/report-entry-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'artifacts/report-entry-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByLabel('Private access code').fill(' fixture-only ');
 await page.getByRole('button',{name:'View my rewards'}).click();
 await page.getByLabel('Station',{exact:true}).fill('116 St–Columbia University');
 await page.getByLabel('Direction or platform').fill('Downtown 1');
 await page.getByLabel('What did you see?').fill('Platform is crowded.');
 await page.getByRole('button',{name:'Review report & reward'}).click();
 await expect(page.getByRole('region',{name:'Confirm report'})).toContainText('Unpaid contribution');
 assert.equal(actions.length,1,'Preparation must not submit');
 await page.getByRole('button',{name:'Submit unpaid report'}).click();
 await expect(page.locator('#report').getByRole('alert')).toContainText('retry submission');
 await page.getByRole('button',{name:'Submit unpaid report'}).click();
 await expect(page.locator('#report').getByRole('status')).toContainText('Report received. Reference: fixture-report');
 assert.equal(actions[1].submissionId,actions[2].submissionId);
 await page.screenshot({path:'artifacts/report-submitted-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: visible reporting entry, mobile layout, unpaid confirmation, retry identity, submission receipt; API fixtures only');
}finally{await browser.close()}
