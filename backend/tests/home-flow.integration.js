'use strict';
// Real local API + existing Supabase integration. Synthetic accounts only; cleaned up afterward.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const db=require('../src/config/supabase'),m=require('../../frontend/js/home-requirements-model');
const base='http://127.0.0.1:3001/api',accounts=[],projects=[],engagements=[];let supplierId=null;
async function req(path,method='GET',body,token){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await r.json();return {status:r.status,data};}
async function check(q){const r=await q;if(r.error)throw Error(r.error.message);return r.data;}
(async()=>{for(const table of ['projects','construction_professionals','construction_engagements','construction_events','construction_notifications']){const result=await db.from(table).select('*').limit(1);if(result.error)throw Error('Database prerequisite missing: '+table+' ('+result.error.code+'). Apply the construction migrations before running this test.');}try{
 for(const type of ['Customer','Contractor','Vendor']){const email='ohisee-test-'+crypto.randomUUID()+'@example.com',password=crypto.randomBytes(24).toString('base64url');const result=await req('/auth/signup','POST',{name:'OH I SEE Integration Test '+type,email,password,role:type==='Customer'?'Customer':'Partner',accountType:type});assert.equal(result.status,201,'Signup '+type+': '+JSON.stringify(result.data));const a={type,email,password,id:result.data.user.id,token:result.data.token};accounts.push(a);const login=await req('/auth/login','POST',{email,password});assert.equal(login.status,200,'Login '+type);assert.equal(login.data.user.id,a.id);if(type!=='Customer')assert.equal(login.data.user.partner_type,type);const me=await req('/auth/me','GET',null,a.token);assert.equal(me.status,200);console.log(type+' signup/login/profile: PASS');}
 const [client,pro,other]=accounts,city='Test City '+crypto.randomUUID().slice(0,8);
 const values={...m.defaults(),length:40,width:30,city},draftId=crypto.randomUUID();
 const saved=await req('/construction/home-requirements','POST',{values,roomSizes:{},share:true,draftId},client.token);assert.equal(saved.status,201,JSON.stringify(saved.data));projects.push(saved.data.projectId);
 const unauthorized=await req('/construction/home-requirements','POST',{values,roomSizes:{},share:true,projectId:projects[0]},other.token);assert.equal(unauthorized.status,404);
 const p=await req('/construction/profile','PUT',{name:'Synthetic Contractor',profession:'General Contractor',company:'Test only',city,bio:'Synthetic profile for integration testing only.',experience_years:1,service_radius_km:10,lat:null,lng:null,available:true,rate:null,rate_unit:'project'},pro.token);assert.equal(p.status,200,JSON.stringify(p.data));
 assert.equal((await req('/construction/home-leads','GET',null,pro.token)).status,403,'Pending provider must not access leads');
 await check(db.from('construction_professionals').update({verification:'verified'}).eq('id',pro.id));
 const leads=await req('/construction/home-leads','GET',null,pro.token);assert.equal(leads.status,200);const lead=leads.data.data.find(p=>p.projectId===projects[0]);assert(lead,'Published requirement missing');assert.equal(lead.requirements.plot.areaSqFt,1200);assert(!JSON.stringify(lead).includes(client.email),'Email leaked');
 const accepted=await req('/construction/home-leads/'+projects[0]+'/accept','POST',{},pro.token);assert.equal(accepted.status,201,JSON.stringify(accepted.data));engagements.push(accepted.data.engagementId);
 const again=await req('/construction/home-leads/'+projects[0]+'/accept','POST',{},pro.token);assert.equal(again.data.engagementId,engagements[0]);
 const inbox=await req('/construction/engagements','GET',null,client.token),row=inbox.data.data.find(r=>r.id===engagements[0]);assert(row,'Client did not receive provider response');
 const msg=await req('/construction/engagements/'+row.id+'/actions','POST',{version:row.version,action:'message',input:{text:'Synthetic integration test: discuss the home requirements.'}},client.token);assert.equal(msg.status,200,JSON.stringify(msg.data));
 const proInbox=await req('/construction/engagements','GET',null,pro.token);assert(proInbox.data.data.find(r=>r.id===row.id).data.messages.length===1);
 const denied=await req('/construction/engagements/'+row.id+'/actions','POST',{version:row.version,action:'message',input:{text:'Unauthorized'}},other.token);assert.equal(denied.status,404);
 assert.equal((await req('/construction/engagements/'+row.id+'/actions','POST',{version:msg.data.data.version,action:'start',input:{}},pro.token)).status,409,'Start must require contract/payment gates');
 console.log('Real requirements publication, provider eligibility, acceptance, client inbox, private messaging and construction gates: PASS');
 }finally{
 const ids=accounts.map(a=>a.id);
 if(engagements.length){await check(db.from('construction_notifications').delete().in('engagement_id',engagements));await check(db.from('construction_events').delete().in('engagement_id',engagements));await check(db.from('construction_engagements').delete().in('id',engagements));}
 if(projects.length){await check(db.from('construction_events').delete().in('project_id',projects));await check(db.from('projects').delete().in('project_id',projects));}
 if(ids.length){await check(db.from('construction_professionals').delete().in('id',ids));for(const a of accounts){const r=await db.auth.admin.deleteUser(a.id);if(r.error)throw Error('Test account cleanup failed: '+r.error.message);}}
 console.log('Synthetic test records cleaned up.');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
