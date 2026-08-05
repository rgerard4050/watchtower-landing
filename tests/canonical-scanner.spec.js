const { test, expect } = require('@playwright/test');

const collection = {
  collectionId:'10000000-0000-4000-8000-000000000001',status:'open',version:0,scanId:null,itemCount:0,
  estimatedResidentDollars:0,estimatedWtwr:0,items:[]
};

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation({ latitude: 29.1, longitude: -82.1 });
  await page.addInitScript(() => {
    window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:'resident-token',user:{id:'resident-user'}}}})}}}};
    window.__cameraRequests=0;
    navigator.mediaDevices={getUserMedia:async()=>{window.__cameraRequests+=1;return {};}};
    HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
    HTMLCanvasElement.prototype.toDataURL=()=>`data:image/jpeg;base64,${btoa('jpeg')}`;
  });
  let state=structuredClone(collection), addCalls=0, stageCalls=0, pickupCalls=0, progressionCalls=0, learningCalls=0, learningCompleted=false;
  const progressionState=()=>{
    const verifiedXp=(addCalls?95:0)+(stageCalls?175:0)+(learningCompleted?125:0);
    const level=verifiedXp>=250
      ?{number:3,title:'Material Scout',currentThreshold:250,nextThreshold:500,xpToNext:500-verifiedXp,progressPercent:Math.floor((verifiedXp-250)/2.5)}
      :verifiedXp>=100
        ?{number:2,title:'Sorter',currentThreshold:100,nextThreshold:250,xpToNext:250-verifiedXp,progressPercent:Math.floor((verifiedXp-100)/1.5)}
        :{number:1,title:'Observer',currentThreshold:0,nextThreshold:100,xpToNext:100-verifiedXp,progressPercent:verifiedXp};
    return {context:'resident',verifiedXp,provisionalXp:addCalls?15:0,level,
      missions:[
        {code:'discover_three_materials',version:1,title:'Material Explorer',description:'Identify three categories.',progress:addCalls?2:0,target:3,status:'active'},
        {code:'complete_safe_battery_learning',version:1,title:'Battery Safety First',description:'Complete safe learning.',progress:learningCompleted?1:0,target:1,status:learningCompleted?'completed':'active'},
        {code:'stage_first_collection',version:1,title:'Stage It Safely',description:'Stage one collection.',progress:stageCalls?1:0,target:1,status:stageCalls?'completed':'active'}],
      recentXp:addCalls?[{id:'xp-item',reasonCode:'collection_item.first_accepted',reason:'First Collection Item accepted with durable evidence.',amount:50,state:'verified',ruleVersion:1},{id:'xp-evidence',reasonCode:'evidence.eligible_submitted',reason:'Eligible evidence submitted and awaiting review.',amount:15,state:'provisional',ruleVersion:1}]:[],
      achievements:[...(addCalls?[{code:'first_collection',version:1,title:'Collection Started',description:'Accepted the first item.'}]:[]),...(stageCalls?[{code:'first_bounty_staged',version:1,title:'Bounty Staged',description:'Staged the first bounty.'}]:[])],
      learningRecommendations:[{moduleId:'safe_battery_handling',version:1,title:'Safe Battery Handling',objective:'Recognize batteries that must not be dismantled.',safetyClassification:'hazard_awareness',completed:learningCompleted}],championRecognition:false};
  };
  await page.route('**/npm/@supabase/supabase-js@2*', route=>route.fulfill({contentType:'text/javascript',body:'window.supabase=window.supabase||{}'}));
  await page.route('**/api/scan', route=>route.fulfill({json:{summary:'Copper wire and cans.',items_seen:['Copper','Aluminum'],estimated_value_low:10,estimated_value_high:40,analysis_id:'a',analysis_token:'signed',estimate_notice:'Estimated — subject to Operator verification.'}}));
  await page.route('**/api/resident-collection**', async route=>{
    const req=route.request(); const body=req.postDataJSON?.()||{};
    if(req.method()==='GET') return route.fulfill({json:state});
    if(body.action==='add_item') { addCalls++; if(!state.items.length){state={...state,version:1,itemCount:1,estimatedResidentDollars:16,estimatedWtwr:1600,items:[{id:'item-1',capturedAt:new Date().toISOString(),summary:'Copper wire and cans.',materials:['Copper','Aluminum'],estimatedResidentDollars:16,estimatedWtwr:1600,reviewState:'proposed',evidenceId:'e1',previewUrl:null}]};} return route.fulfill({json:state}); }
    if(body.action==='stage'){stageCalls++;state={...state,status:'staged',version:2,scanId:'scan-1'};return route.fulfill({json:state});}
    return route.fulfill({status:422,json:{error:{message:'bad'}}});
  });
  await page.route('**/api/resident-pickup**', route=>{pickupCalls++;return route.fulfill({json:{collectionId:state.collectionId,scanId:'scan-1',pickupRequested:true,pickupStatus:'open',job:{id:7,status:'PENDING'}}});});
  await page.route('**/api/resident-progression**', route=>{
    progressionCalls++;
    if(route.request().method()==='POST'){learningCalls++;learningCompleted=true;}
    return route.fulfill({json:progressionState()});
  });
  await page.goto('/scanner.html');
  await page.evaluate(() => Object.defineProperties(document.getElementById('webcam'),{videoWidth:{value:640},videoHeight:{value:480}}));
  await page.evaluate(()=>document.getElementById('webcam').dispatchEvent(new Event('canplay')));
  await page.exposeFunction('testCounts',()=>({addCalls,stageCalls,pickupCalls,progressionCalls,learningCalls}));
});

test('requires and displays explicit Basic Resident context', async ({page})=>{
  await expect(page.locator('#residentContext')).toContainText('PERSONAL / RESIDENT');
  await expect(page.locator('#capture-btn')).toBeEnabled();
  await expect(page.locator('#xpTotal')).toHaveText('0 XP');
  await expect(page.locator('.progression-card')).toContainText('XP tracks learning and participation only');
  await expect(page.locator('#estimateNotice')).toHaveText('Estimated — subject to Operator verification.');
});

test('camera permission waits for an explicit resident action', async ({page})=>{
  await page.evaluate(()=>Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__cameraRequests+=1;return {};}}}));
  expect(await page.evaluate(()=>window.__cameraRequests)).toBe(0);
  await page.locator('#start-camera-btn').click();
  expect(await page.evaluate(()=>window.__cameraRequests)).toBe(1);
});

test('new resident demo supports upload, correction, asset, transfer, buyer, and simulated sale timeline', async ({page})=>{
  await page.goto('/scanner.html?demo=1');
  await page.evaluate(()=>localStorage.removeItem('watchtower_resident_demo_v1'));
  await page.reload();
  await expect(page.locator('#demoBanner')).toContainText('sale shown is simulated');
  await page.locator('#file-input').setInputFiles('icon-1.png');
  await expect(page.locator('#demoLifecycle')).toBeVisible();
  await page.locator('#materialCorrection').fill('Corrected aluminum can');
  await page.locator('#confirm-material-btn').click();
  await page.locator('#create-asset-btn').click();
  await page.locator('#list-asset-btn').click();
  await page.locator('#receive-asset-btn').click();
  await page.locator('#simulate-sale-btn').click();
  await expect(page.locator('#lifecycleTimeline li.done')).toHaveCount(6);
  await expect(page.locator('#finalValue')).toContainText('SIMULATION COMPLETE');
  await expect(page.locator('#finalValue')).toContainText('No money, token, or payment was created');
});

test('camera denial shows a useful upload fallback on a mobile viewport', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/scanner.html?demo=1');
  await page.evaluate(()=>Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw new DOMException('Permission denied','NotAllowedError');}}}));
  await page.locator('#start-camera-btn').click();
  await expect(page.locator('#cameraError')).toBeVisible();
  await expect(page.locator('label[for="file-input"]')).toHaveText('Upload Photo');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('accepts repeated captures as durable items without browser financial math', async ({page})=>{
  await page.locator('#capture-btn').click(); await expect(page.locator('#log-btn')).toBeVisible();
  await expect(page.locator('#earnedText')).toContainText('calculated by the server');
  await page.locator('#log-btn').click();
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await expect(page.locator('#collectionValue')).toHaveText('$16.00');
  await expect(page.locator('#collectionWtwr')).toContainText('1,600');
  await page.locator('#drawer-btn').click(); await expect(page.locator('#collection-ledger')).toContainText('Item item-1');
});

test('retake changes only pending capture and keeps accepted ledger', async ({page})=>{
  await page.locator('#capture-btn').click(); await page.locator('#log-btn').click();
  await page.locator('#new-collection-btn').click(); await page.locator('#capture-btn').click(); await page.locator('#retake-btn').click();
  await expect(page.locator('#collectionCount')).toHaveText('1');
});

test('stages once then requests pickup separately and shows durable Job status', async ({page})=>{
  await page.locator('#capture-btn').click(); await page.locator('#log-btn').click();
  await page.locator('#stage-btn').dblclick(); await expect(page.locator('#collectionStatus')).toHaveText('staged');
  await expect(page.locator('#pickup-btn')).toBeVisible(); await page.locator('#pickup-btn').dblclick();
  await expect(page.locator('#pickup-btn')).toHaveText('PICKUP REQUESTED');
  await expect(page.locator('#console')).toContainText('JOB PENDING');
  const counts=await page.evaluate(()=>window.testCounts());expect(counts.stageCalls).toBe(1);expect(counts.pickupCalls).toBe(1);
});

test('reload recovers the same durable collection', async ({page})=>{
  await page.locator('#capture-btn').click(); await page.locator('#log-btn').click(); await page.reload();
  await expect(page.locator('#collectionCount')).toHaveText('1');
  await expect(page.locator('#collection-ledger')).toContainText('item-1');
});

test('confirmed item updates verified and provisional XP once on double-click', async ({page})=>{
  await page.locator('#capture-btn').click(); await page.locator('#log-btn').dblclick();
  await expect(page.locator('#xpTotal')).toHaveText('95 XP');
  await expect(page.locator('#xpProvisional')).toContainText('15');
  await page.locator('#xp-drawer-btn').click();
  await expect(page.locator('#xp-history')).toContainText('verified');
  await expect(page.locator('#xp-history')).toContainText('provisional');
  expect((await page.evaluate(()=>window.testCounts())).addCalls).toBe(1);
});

test('mission and level progress are server projections and survive reload', async ({page})=>{
  await page.locator('#capture-btn').click(); await page.locator('#log-btn').click();
  await expect(page.locator('#missionList')).toContainText('Material Explorer: 2/3');
  await expect(page.locator('#levelValue')).toContainText('Level 1');
  await expect(page.locator('.level-track')).toHaveAttribute('aria-valuenow','95');
  await page.reload();
  await expect(page.locator('#missionList')).toContainText('Material Explorer: 2/3');
  await expect(page.locator('#xpTotal')).toHaveText('95 XP');
});

test('verified review resolves provisional XP in the server projection', async ({page})=>{
  await page.locator('#capture-btn').click(); await page.locator('#log-btn').click();
  await expect(page.locator('#xpProvisional')).toContainText('15');
  await page.unroute('**/api/resident-progression**');
  await page.route('**/api/resident-progression**',route=>route.fulfill({json:{context:'resident',verifiedXp:110,provisionalXp:0,
    level:{number:2,title:'Sorter',nextThreshold:250,xpToNext:140,progressPercent:7},missions:[],achievements:[],learningRecommendations:[],
    recentXp:[{id:'verified-evidence',reason:'Eligible evidence verified.',amount:15,state:'verified',ruleVersion:1}]}}));
  await page.evaluate(()=>window.__residentScanner.loadProgression());
  await expect(page.locator('#xpTotal')).toHaveText('110 XP');
  await expect(page.locator('#xpProvisional')).toContainText('0');
});

test('learning completion is durable and idempotent in the presentation', async ({page})=>{
  const learning=page.locator('#learningRecommendations button');
  await learning.dblclick();
  await expect(learning).toHaveText('COMPLETED');
  expect((await page.evaluate(()=>window.testCounts())).learningCalls).toBe(1);
  await page.reload();
  await expect(page.locator('#learningRecommendations button')).toHaveText('COMPLETED');
});

test('achievement celebration is accessible, non-blocking, and keeps staging available', async ({page})=>{
  await page.locator('#capture-btn').click(); await page.locator('#log-btn').click();
  await expect(page.locator('#achievementCelebration')).toContainText('Collection Started');
  await expect(page.locator('#achievementCelebration')).toHaveAttribute('role','status');
  await expect(page.locator('#stage-btn')).toBeVisible();
});
