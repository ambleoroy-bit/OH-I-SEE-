 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {app,records,reset,token}=require('./marketplace-fixture');
let server,url;
test.before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;});
test.after(()=>new Promise(r=>server.close(r)));test.beforeEach(reset);
async function req(path,user,body,method){const r=await fetch(url+'/api/marketplace'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+token(user)}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
async function select(){return (await req('/projects/P1/select','c1',{contractor_id:'b1'})).data;}
test('anonymous and other customers cannot read or select a project',async()=>{
 assert.equal((await req('/projects/P1/comparison')).status,401);
 assert.equal((await req('/projects/P1/comparison','c2')).status,404);
 assert.equal((await req('/projects/P1/select','c2',{contractor_id:'b1'})).status,404);
});
test('only registered contractors with pricing appear; forged builder and rate are rejected or ignored',async()=>{
 const result=await req('/projects/P1/comparison','c1');assert.equal(result.data.quotes.length,1);assert.equal(result.data.quotes[0].estimate_min,1200000);
 assert.equal((await req('/projects/P1/select','c1',{contractor_id:'fake',final_quote:1})).status,400);
 assert.equal((await req('/projects/P1/select','c1',{contractor_id:'b2'})).status,400);
 const j=await select();assert.equal(j.data.estimate.estimate_min,1200000);assert.equal(j.contractor_id,'b1');
 assert.equal((await select()).id,j.id);assert.equal(records.marketplace_jobs.length,1);
});
test('selection validates room footprint on the server',async()=>{
 records.projects[0].construction_context.projectRequirements.size_kitchen=798;
 assert.equal((await req('/projects/P1/select','c1',{contractor_id:'b1'})).status,400);assert.equal(records.marketplace_jobs.length,0);
});
test('leads and messages are private to selected contractor and owner',async()=>{
 const j=await select();assert.equal((await req('/jobs','b1')).data.length,1);assert.equal((await req('/jobs','b2')).data.length,0);
 assert.equal((await req('/jobs/'+j.id,'b2')).status,404);
 assert.equal((await req('/jobs/'+j.id+'/actions','c1',{action:'accept',version:1})).status,403);
 assert.equal((await req('/jobs/'+j.id+'/actions','b1',{action:'accept',version:0})).status,409);
 const r=await req('/jobs/'+j.id+'/actions','b1',{action:'message',version:1,text:'Reviewing your quote'});assert.equal(r.data.data.unread_for,'c1');
});
test('full contractor -> supplier -> proposal -> revision -> approval -> execution flow',async()=>{
 let j=await select();const act=async(user,action,extra={})=>{const r=await req('/jobs/'+j.id+'/actions',user,{version:j.version,action,...extra});if(r.status===200)j=r.data;return r;};
 assert.equal((await act('b1','start')).status,409);
 assert.equal((await act('b1','accept')).status,200);assert.equal(j.data.stage,'estimating');
 assert.equal((await act('b1','roadmap',{operation:'grade',grade:'Standard',specification:'Approved structural revision S1; finishes as schedule F1.'})).status,200);
 assert.equal((await act('c1','roadmap',{operation:'approve_grade'})).status,200);
 const suppliers=await req('/suppliers','b1');assert.equal(suppliers.data.length,2,'new registered supplier appears without products');
 const proposal={items:[{product_id:'p1',quantity:100,rate:1},{product_id:'p2',quantity:200}],labour:200000,other:10000,tax_percent:18,contingency_percent:10,duration_days:180,exclusions:'Includes civil works; unlisted categories excluded.'};
 assert.equal((await act('b1','proposal',proposal)).status,200);assert.equal(j.data.proposal.total,340480);
 assert.equal((await act('b1','approve',{confirm_total:340480})).status,403);
 assert.equal((await act('c1','approve',{confirm_total:1})).status,409);
 assert.equal((await act('c1','revise',{text:'Please reduce other costs'})).status,200);
 assert.equal((await act('b1','proposal',{...proposal,other:0})).status,200);
 assert.equal((await act('c1','approve',{confirm_total:j.data.proposal.total})).status,200);
 assert.equal((await act('b1','start')).status,200);assert.equal(j.data.stage,'in_execution');
 assert.equal((await act('b1','proposal',proposal)).status,409);
});
test('supplier catalog writes enforce ownership and current prices',async()=>{
 const product={name:'New product',category:'Plumbing',brand:'Test',unit:'piece',price:100,stock:5};
 assert.equal((await req('/products','c1',product)).status,403);
 assert.equal((await req('/products/p1','s2',product,'PUT')).status,404);
 assert.equal((await req('/products','s1',product)).status,201);
 assert.equal((await req('/suppliers/s1/products','c1')).status,403);
 assert.equal((await req('/suppliers/s1/products','b1')).data.length,3);
});
test('profile role cannot be forged and minimum/maximum rates are enforced',async()=>{
 const profile={company:'New Builder',city:'Coimbatore',scope:'All civil',rate_min:1500,rate_max:1800,kind:'contractor'};
 assert.equal((await req('/profile','c1',profile,'PUT')).status,403);
 assert.equal((await req('/profile','b2',{...profile,rate_max:1000},'PUT')).status,400);
 assert.equal((await req('/profile','b2',profile,'PUT')).status,200);
 assert.equal((await req('/projects/P1/comparison','c1')).data.quotes.length,2);
});
test('saved projects appear before selection, scoped to city with private fields removed',async()=>{
 records.projects[0].status='draft';
 records.projects[0].client_name='Private client';
 records.projects[0].construction_context.documents=[{storage_path:'private-document'}];
 records.projects.push({...records.projects[0],project_id:'OTHER',city:'Chennai'});
 records.projects.push({...records.projects[0],project_id:'CLOSED',status:'cancelled'});
 assert.equal((await req('/saved-projects')).status,401);
 assert.equal((await req('/saved-projects','c1')).status,403);
 assert.equal((await req('/saved-projects','s1')).status,403);
 const r=await req('/saved-projects','b2');
 assert.equal(r.status,200);assert.equal(r.data.length,1);
 assert.equal(r.data[0].project_id,'P1');assert.equal(r.data[0].status,'draft');
 assert.equal(r.data[0].budget,1500000);
 for(const key of ['user_id','client_name','construction_context','location']) assert.equal(key in r.data[0],false);
 await select();
 assert.equal((await req('/saved-projects','b2')).data.length,0);
 assert.equal((await req('/jobs','b1')).data.length,1);
});
test('saved project viewer returns full customer inputs only to matching contractors',async()=>{
 records.projects[0].construction_context.projectSetup={owner_name:'Client',features:{lift:true}};
 records.projects[0].construction_context.projectRequirements.custom_rooms=[{name:'Studio',area:80}];
 records.projects[0].construction_context.documents=[{storage_path:'private'}];
 const r=await req('/saved-projects/P1','b2');
 assert.equal(r.status,200);assert.equal(r.data.project_id,'P1');
 assert.equal(r.data.construction_context.projectSetup.features.lift,true);
 assert.equal(r.data.construction_context.projectRequirements.custom_rooms[0].area,80);
 assert.equal(r.data.user_id,undefined);assert.equal(r.data.construction_context.documents,undefined);
 assert.equal((await req('/saved-projects/P1','c2')).status,403);
 records.users.find(u=>u.id==='b2').city='Chennai';
 assert.equal((await req('/saved-projects/P1','b2')).status,404);
 assert.equal((await req('/saved-projects/MISSING','b1')).status,404);
 await select();assert.equal((await req('/saved-projects/P1','b1')).status,404);
});
test('registered contractors remain visible before publishing pricing',async()=>{
 const r=await req('/projects/P1/comparison','c1');
 assert.equal(r.data.builders.length,2);
 const pending=r.data.builders.find(b=>b.contractor_id==='b2');
 assert.equal(pending.company,'Registered Builder Two');assert.equal(pending.pricing_ready,false);
 assert.equal(r.data.quotes.length,1);
 records.users.find(u=>u.id==='b2').partner_status='suspended';
 assert.equal((await req('/projects/P1/comparison','c1')).data.builders.length,1);
});
test('unpriced contractor request delivers details and unlocks contact only after acceptance',async()=>{
 const builder=records.users.find(u=>u.id==='b2');builder.email='builder@example.test';builder.phone='9876543210';builder.profile_image='https://example.test/photo.png';
 const compare=await req('/projects/P1/comparison','c1');assert.equal(compare.data.builders.find(b=>b.contractor_id==='b2').profile_image,builder.profile_image);assert.equal(JSON.stringify(compare).includes(builder.email),false);
 let r=await req('/projects/P1/request','c1',{contractor_id:'b2'});assert.equal(r.status,201);let j=r.data;
 assert.equal(j.data.project.project_id,'P1');assert.equal(j.data.estimate.estimate_min,null);
 assert.equal((await req('/jobs/'+j.id,'c1')).data.contact,undefined);
 assert.equal((await req('/jobs','b2')).data.length,1);
 assert.equal((await req('/jobs/'+j.id+'/actions','b1',{action:'accept',version:j.version})).status,404);
 r=await req('/jobs/'+j.id+'/actions','b2',{action:'accept',version:j.version});assert.equal(r.status,200);
 const approved=await req('/projects/P1/comparison','c1');assert.ok(approved.data.job.data.accepted_at);assert.equal(approved.data.job.contact.email,builder.email);assert.equal(approved.data.job.contact.phone,builder.phone);
 assert.equal((await req('/jobs/'+j.id,'c2')).status,404);
});
test('customer can request multiple builders with isolated acceptance and messages',async()=>{
 const first=await req('/projects/P1/request','c1',{contractor_id:'b1'});
 const second=await req('/projects/P1/request','c1',{contractor_id:'b2'});
 assert.equal(first.status,201);assert.equal(second.status,201);assert.notEqual(first.data.id,second.data.id);
 const compare=await req('/projects/P1/comparison','c1');assert.equal(compare.data.requests.length,2);
 assert.equal((await req('/jobs','b1')).data.length,1);assert.equal((await req('/jobs','b2')).data.length,1);
 assert.equal((await req('/jobs/'+first.data.id,'b2')).status,404);
 assert.equal((await req('/projects/P1/request','c1',{contractor_id:'b2'})).data.id,second.data.id);
});
