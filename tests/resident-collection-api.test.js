const test=require('node:test'); const assert=require('node:assert/strict'); const crypto=require('node:crypto');

function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},end(){return this;}};}
function fresh(path){for(const dependency of [path,'../server/resident'])delete require.cache[require.resolve(dependency)];return require(path);}
function residentRequest(overrides={}){return {query:{resource:'collection'},...overrides};}

test('analysis returns a signed, expiring server reference without calculating WTWR',async()=>{
  process.env.ANTHROPIC_API_KEY='test';process.env.ANALYSIS_SIGNING_SECRET='secret';
  global.fetch=async()=>({json:async()=>({content:[{type:'text',text:JSON.stringify({summary:'Wire',estimated_value_low:2,estimated_value_high:10,items_seen:['Copper'],coaching_tip:'Separate it.',safety_warning:''})}]})});
  const res=response();await fresh('../api/scan')({method:'POST',body:{imageBase64:'abc',mediaType:'image/jpeg'}},res);
  assert.equal(res.statusCode,200);assert.ok(res.body.analysis_id);assert.match(res.body.analysis_token,/\./);assert.equal('estimated_wtwr' in res.body,false);
});

test('invalid analysis token is rejected before a collection RPC',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';process.env.ANALYSIS_SIGNING_SECRET='secret';
  let rpcCalled=false;global.fetch=async url=>{if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'u'})};rpcCalled=true;return {ok:false,json:async()=>({})};};
  const res=response();await fresh('../api/resident')(residentRequest({method:'POST',headers:{authorization:'Bearer user'},body:{action:'add_item',collectionId:crypto.randomUUID(),clientItemId:crypto.randomUUID(),analysisToken:'bad',imageBase64:'abc'}}),res);
  assert.equal(res.statusCode,422);assert.equal(rpcCalled,false);
});

test('Resident API rejects missing authentication with normalized error',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';const res=response();await fresh('../api/resident')(residentRequest({method:'GET',headers:{}}),res);
  assert.equal(res.statusCode,401);assert.equal(res.body.error.code,'unauthorized');
});

test('Add Item uses the service-only RPC and attaches evidence from the signed analysis',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';process.env.SUPABASE_SERVICE_ROLE_KEY='service';process.env.ANALYSIS_SIGNING_SECRET='secret';
  const userId=crypto.randomUUID(),collectionId=crypto.randomUUID(),itemId=crypto.randomUUID(),analysisId=crypto.randomUUID();
  const payload={analysisId,model:'test-model',issuedAt:Date.now(),expiresAt:Date.now()+60000,summary:'Copper wire',itemsSeen:['Copper'],estimatedValueLow:2,estimatedValueHigh:10};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token=`${encoded}.${crypto.createHmac('sha256','secret').update(encoded).digest('base64url')}`;
  const calls=[];
  const projection={collectionId,status:'open',version:1,itemCount:1,items:[{id:itemId,clientItemId:itemId,evidenceId:analysisId,evidenceObjectPath:`${userId}/${collectionId}/${itemId}/${analysisId}.jpg`} ]};
  global.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/auth/v1/user'))return {ok:true,json:async()=>({id:userId})};
    if(String(url).includes('/rpc/resident_collection_add_item'))return {ok:true,json:async()=>projection};
    if(String(url).includes('/object/collection-evidence/'))return {ok:true,json:async()=>({})};
    if(String(url).includes('/rpc/resident_collection_attach_evidence'))return {ok:true,json:async()=>projection};
    if(String(url).includes('/object/sign/'))return {ok:false,json:async()=>({})};
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const res=response();
  await fresh('../api/resident')(residentRequest({method:'POST',headers:{authorization:'Bearer user'},body:{action:'add_item',collectionId,expectedVersion:0,clientItemId:itemId,analysisToken:token,imageBase64:'YWJj'}}),res);
  assert.equal(res.statusCode,200);
  const addCall=calls.find(call=>call.url.includes('/rpc/resident_collection_add_item'));
  assert.equal(addCall.options.headers.apikey,'service');
  const rpcBody=JSON.parse(addCall.options.body);
  assert.equal(rpcBody.p_resident_user_id,userId);
  assert.equal(rpcBody.p_estimated_high,10);
  assert.equal('estimatedHigh' in rpcBody,false);
  assert.ok(calls.some(call=>call.url.includes('/rpc/resident_collection_attach_evidence')));
});

test('Resident progression returns the safe server projection without client-side XP math',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';
  const projection={context:'resident',verifiedXp:125,provisionalXp:15,level:{number:2,title:'Sorter'},missions:[],recentXp:[]};
  const calls=[];
  global.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'resident-user'})};
    if(String(url).includes('/rpc/resident_gamification_projection'))return {ok:true,json:async()=>projection};
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const res=response();
  await fresh('../api/resident')({query:{resource:'progression'},method:'GET',headers:{authorization:'Bearer user'}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,projection);
  assert.equal(calls.filter(call=>call.url.includes('/rpc/resident_gamification_projection')).length,1);
});

test('Resident progression requires authentication',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';
  const res=response();
  await fresh('../api/resident')({query:{resource:'progression'},method:'GET',headers:{}},res);
  assert.equal(res.statusCode,401);
  assert.equal(res.body.error.code,'unauthorized');
});

test('Resident progression rejects a client-supplied XP amount before any award command',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';let rpcCalled=false;
  global.fetch=async url=>{
    if(String(url).includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'resident-user'})};
    rpcCalled=true;return {ok:false,json:async()=>({})};
  };
  const res=response();
  await fresh('../api/resident')({query:{resource:'progression'},method:'POST',headers:{authorization:'Bearer user'},
    body:{action:'complete_learning',moduleId:'safe_battery_handling',moduleVersion:1,idempotencyKey:crypto.randomUUID(),xpAmount:999999}},res);
  assert.equal(res.statusCode,422);
  assert.equal(res.body.error.message,'XP amounts are server-derived.');
  assert.equal(rpcCalled,false);
});

test('Learning completion sends only module identity and idempotency to the authenticated RPC',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';const key=crypto.randomUUID();let rpcBody;
  global.fetch=async(url,options={})=>{
    if(String(url).includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'resident-user'})};
    if(String(url).includes('/rpc/resident_complete_learning_module')){
      rpcBody=JSON.parse(options.body);return {ok:true,json:async()=>({verifiedXp:50,provisionalXp:0,level:{number:1}})};
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const res=response();
  await fresh('../api/resident')({query:{resource:'progression'},method:'POST',headers:{authorization:'Bearer user'},
    body:{action:'complete_learning',moduleId:'safe_battery_handling',moduleVersion:1,idempotencyKey:key}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(rpcBody,{p_module_id:'safe_battery_handling',p_module_version:1,p_idempotency_key:key});
});

test('Resident progression rejects cross-context attribution before its command RPC',async()=>{
  process.env.SUPABASE_ANON_KEY='anon';let rpcCalled=false;
  global.fetch=async url=>{
    if(String(url).includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'resident-user'})};
    rpcCalled=true;return {ok:false,json:async()=>({})};
  };
  const res=response();
  await fresh('../api/resident')({query:{resource:'progression'},method:'POST',headers:{authorization:'Bearer user'},
    body:{action:'complete_learning',activeContext:'field_partner',moduleId:'safe_battery_handling',moduleVersion:1,idempotencyKey:crypto.randomUUID()}},res);
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error.code,'forbidden');
  assert.equal(rpcCalled,false);
});
