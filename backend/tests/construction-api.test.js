'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),jwt=require('jsonwebtoken');
const records={users:[{id:'customer',role:'Customer'},{id:'professional',role:'Customer'},{id:'stranger',role:'Admin'}],projects:[{project_id:'P1',user_id:'customer'}],construction_admins:[],construction_professionals:[],construction_engagements:[{id:'E1',project_id:'P1',customer_id:'customer',professional_id:'professional',version:1,data:{stage:'requested'}}]};
class Query{
 constructor(table){this.rows=records[table]||[];this.filters=[];this.fields='*';}
 select(f){this.fields=f||'*';return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 order(){return this;}limit(){return this;}maybeSingle(){this.singleRow=true;return this;}single(){this.singleRow=true;return this;}
 then(resolve){let rows=this.rows.filter(r=>this.filters.every(f=>f(r)));if(this.fields!=='*')rows=rows.map(r=>Object.fromEntries(this.fields.split(',').map(k=>[k,r[k]])));return Promise.resolve({data:this.singleRow?rows[0]||null:rows,error:null}).then(resolve);}
}
const config=require.resolve('../src/config/supabase');
require.cache[config]={id:config,filename:config,loaded:true,exports:{from:t=>new Query(t),rpc:()=>{throw Error('Unexpected mutation in authorization test');}}};
process.env.JWT_SECRET='isolated-test-secret-not-production';
const {router}=require('../src/routes/construction');
const app=express();app.use(express.json());app.use('/api/construction',router);
let server,url;
test.before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;});
test.after(()=>new Promise(r=>server.close(r)));
async function request(path,user,body){return fetch(url+'/api/construction'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+jwt.sign({userId:user},process.env.JWT_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});}
test('API rejects anonymous and invalid-token private access',async()=>{
 assert.equal((await request('/engagements')).status,401);
 const r=await fetch(url+'/api/construction/engagements',{headers:{Authorization:'Bearer invalid'}});assert.equal(r.status,401);
});
test('API returns only participant engagements',async()=>{
 assert.equal((await (await request('/engagements','customer')).json()).data.length,1);
 assert.equal((await (await request('/engagements','professional')).json()).data.length,1);
 assert.equal((await (await request('/engagements','stranger')).json()).data.length,0);
});
test('unrelated user cannot read events or mutate agreement',async()=>{
 assert.equal((await request('/engagements/E1/events','stranger')).status,404);
 assert.equal((await request('/engagements/E1/actions','stranger',{version:1,action:'message',input:{text:'unauthorized'}})).status,404);
});
test('existing Admin role alone cannot verify professionals',async()=>{
 assert.equal((await request('/verification','stranger')).status,403);
});
test('API rejects stale workflow versions and customer quotation submission',async()=>{
 assert.equal((await request('/engagements/E1/actions','customer',{version:0,action:'message',input:{text:'stale'}})).status,409);
 assert.equal((await request('/engagements/E1/actions','customer',{version:1,action:'quote',input:{}})).status,403);
});
test('another customer project cannot receive a quote request',async()=>{
 assert.equal((await request('/requests','stranger',{project_id:'P1',professional_id:'professional',kind:'quote',scope:'test'})).status,404);
});

