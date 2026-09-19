 'use strict';
// Synthetic records for isolated tests only. Never mounted by the application server.
const express=require('express'),jwt=require('jsonwebtoken'),crypto=require('node:crypto');
const records={};
function reset(){Object.assign(records,{users:[
 {id:'c1',role:'Customer',name:'Test Client'}, {id:'c2',role:'Customer',name:'Other Client'},
 {id:'b1',role:'Partner',partner_type:'Contractor',name:'Test Builder',company:'Registered Builder One',city:'Coimbatore'},
 {id:'b2',role:'Partner',partner_type:'Contractor',name:'Other Builder',company:'Registered Builder Two',city:'Coimbatore'},
 {id:'s1',role:'Partner',partner_type:'Supplier',name:'Test Supplier',company:'Registered Cement & Electrical',city:'Coimbatore'},
 {id:'s2',role:'Supplier',name:'New Supplier',company:'New Registered Supplier',city:'Coimbatore'}],
 projects:[{project_id:'P1',user_id:'c1',project_name:'Test 30 × 20 Home',city:'Coimbatore',plot_size:'30 x 20 ft',plot_length:30,plot_width:20,built_up_area:'1000 sq.ft',floors:2,budget:1500000,estimated_cost:1300000,construction_context:{landSite:{plot_length_ft:30,plot_width_ft:20},projectRequirements:{plot_length:30,plot_width:20,built_up_area:1000,floors:'G + 1 (2 Floors)',qty_bedrooms:2,size_master_bedroom:120,size_bedroom_2:100,size_kitchen:90}}}],
 marketplace_profiles:[{user_id:'b1',kind:'contractor',company:'Registered Builder One',city:'Coimbatore',rate_min:1200,rate_max:1400,scope:'Structure, plumbing and electrical; finishes excluded',available:true},{user_id:'s1',kind:'supplier',company:'Registered Cement & Electrical',city:'Coimbatore',scope:'Cement, brick, electrical and plumbing products',available:true}],
 marketplace_products:[{id:'p1',supplier_id:'s1',name:'OPC cement 50kg',brand:'Test brand',category:'Cement',unit:'bag',price:400,stock:1000,active:true},{id:'p2',supplier_id:'s1',name:'Copper cable',brand:'Test brand',category:'Electrical',unit:'metre',price:80,stock:2000,active:true}],marketplace_jobs:[]});}
reset();
class Query{
 constructor(table){this.table=table;this.filters=[];}
 select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}in(k,values){this.filters.push(r=>values.includes(r[k]));return this;}
 order(){return this;}limit(){return this;}single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
 insert(row){this.operation='insert';this.payload=row;return this;}update(row){this.operation='update';this.payload=row;return this;}upsert(row){this.operation='upsert';this.payload=row;return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{
  const table=records[this.table];if(!table)return {data:null,error:{code:'PGRST205'}};
  let rows=table.filter(r=>this.filters.every(f=>f(r)));
  if(this.operation==='insert'){
   if(this.table==='marketplace_jobs'&&table.some(r=>r.project_id===this.payload.project_id&&r.contractor_id===this.payload.contractor_id))return {data:null,error:{code:'23505'}};
   const row={id:crypto.randomUUID(),version:1,...structuredClone(this.payload)};table.push(row);rows=[row];
  }else if(this.operation==='update'){rows.forEach(r=>Object.assign(r,structuredClone(this.payload)));}
  else if(this.operation==='upsert'){let row=table.find(r=>r.user_id===this.payload.user_id);if(row)Object.assign(row,structuredClone(this.payload));else{row=structuredClone(this.payload);table.push(row);}rows=[row];}
  return {data:structuredClone(this.one?rows[0]||null:rows),error:null};
 }).then(resolve,reject);}
}
const config=require.resolve('../src/config/supabase');require.cache[config]={id:config,filename:config,loaded:true,exports:{from:table=>new Query(table)}};
process.env.JWT_SECRET='synthetic-marketplace-tests-only';
const app=express();app.use(express.json());app.use('/api/marketplace',require('../src/routes/marketplace'));
const token=id=>jwt.sign({userId:id},process.env.JWT_SECRET);
module.exports={app,records,reset,token};
if(require.main===module){
 app.get('/__test__/session/:id',(req,res)=>records.users.some(u=>u.id===req.params.id)?res.json({token:token(req.params.id)}):res.sendStatus(404));
 app.use(express.static(require('node:path').resolve(__dirname,'../../frontend')));
 app.listen(3107,'127.0.0.1',()=>console.log('Synthetic marketplace browser fixture: http://127.0.0.1:3107'));
}
