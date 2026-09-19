'use strict';
const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../config/supabase');
const d = require('../services/constructionDomain');
const { verifySignature, capturedPayment } = require('../services/constructionPayments');
const router = express.Router();
const fields = 'id,name,profession,company,city,bio,experience_years,service_radius_km,lat,lng,available,rate,rate_unit,verification';
const wrap = fn => async (req,res) => { try { await fn(req,res); } catch(e) {
  const status=e.status || (['40001','23505'].includes(e.code)?409:503);
  res.status(status).json({error:e.status?e.message:status===409?'Record changed or already exists. Refresh and retry.':'Construction services unavailable. Check the database migration and server configuration.'});
}};
async function result(query) { const {data,error}=await query; if(error) throw error; return data; }
async function ownedProject(id,actor) {
  const p=await result(db.from('projects').select('*').eq('project_id',id).eq('user_id',actor).maybeSingle());
  if(!p) d.fail('Project not found.',404); return p;
}
async function engagement(id,actor) {
  const row=await result(db.from('construction_engagements').select('*').eq('id',id).maybeSingle());
  if(!row || ![row.customer_id,row.professional_id].includes(actor)) d.fail('Engagement not found.',404); return row;
}
async function save(row,data,actor,action) {
  return result(db.rpc('construction_save',{p_id:row.id,p_version:row.version,p_data:data,p_actor:actor,p_action:action}));
}
async function admin(actor) {
  if(!await result(db.from('construction_admins').select('user_id').eq('user_id',actor).maybeSingle())) d.fail('Marketplace administrator access required.',403);
}
function profile(b,id) {
  if(!d.professions.includes(b.profession)) d.fail('Choose a supported profession.');
  const lat=b.lat===''||b.lat==null?null:d.number(b.lat,'Latitude',-90,90);
  const lng=b.lng===''||b.lng==null?null:d.number(b.lng,'Longitude',-180,180);
  if((lat===null)!==(lng===null)) d.fail('Provide both coordinates or neither.');
  const years=d.number(b.experience_years,'Experience',0,80);
  if(!Number.isInteger(years)) d.fail('Experience must be whole years.');
  if(!['project','day','sq ft','hour'].includes(b.rate_unit)) d.fail('Choose a supported rate unit.');
  return {id,name:d.text(b.name,'Name',100),company:String(b.company||'').slice(0,150),profession:b.profession,city:d.text(b.city,'City',100),bio:d.text(b.bio,'Description',2000),experience_years:years,service_radius_km:d.number(b.service_radius_km,'Service radius',1,500),lat,lng,available:b.available===true,rate:b.rate===''||b.rate==null?null:d.number(b.rate,'Indicative rate'),rate_unit:b.rate_unit,verification:'pending',verified_by:null,verified_at:null,verification_reference:null,updated_at:new Date().toISOString()};
}
const webhook=wrap(async(req,res)=>{
  if(!process.env.RAZORPAY_WEBHOOK_SECRET) d.fail('Payment webhook is not configured.',503);
  if(!verifySignature(req.body,req.get('x-razorpay-signature'),process.env.RAZORPAY_WEBHOOK_SECRET)) d.fail('Invalid webhook signature.',401);
  let event; try {event=JSON.parse(req.body.toString('utf8'));} catch {d.fail('Invalid webhook JSON.');}
  if(event.event!=='payment.captured') return res.json({received:true});
  const order=event.payload?.payment?.entity?.order_id;
  if(!order) d.fail('Missing payment order.');
  const row=await result(db.from('construction_engagements').select('*').eq('data->payment->>order_id',order).maybeSingle());
  if(!row) d.fail('Order not found.',404);
  const data=capturedPayment(row,event);
  if(data) await save(row,data,null,'payment_verified');
  res.json({received:true});
});
router.get('/capabilities',(req,res)=>res.json({professions:d.professions,payment:Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_WEBHOOK_SECRET),matching:'Explainable rules'}));
router.get('/professionals',wrap(async(req,res)=>{
  const f={...req.query,available:req.query.available==='true'};
  if(!f.city) d.fail('Project city is required.');
  if(f.lat!==undefined||f.lng!==undefined) {f.lat=d.number(f.lat,'Latitude',-90,90);f.lng=d.number(f.lng,'Longitude',-180,180);}
  for(const key of ['radius','rating','experience','price','completed']) if(f[key]!==undefined&&f[key]!=='') d.number(f[key],key);
  let q=db.from('construction_professionals').select(fields).eq('verification','verified');
  if(f.profession) q=q.eq('profession',f.profession);
  if(f.lat===undefined) q=q.ilike('city',String(f.city).replace(/[%_]/g,''));
  const profiles=await result(q.order('id').limit(500));
  let reviews=[];
  if(profiles.length) reviews=await result(db.from('construction_engagements').select('professional_id,data').in('professional_id',profiles.map(p=>p.id)).eq('data->>stage','completed').limit(5000));
  for(const p of profiles) {
    const done=reviews.filter(r=>r.professional_id===p.id), rated=done.filter(r=>r.data.review);
    p.completed_projects=done.length; p.review_count=rated.length;
    p.rating=rated.length?Math.round(rated.reduce((s,r)=>s+r.data.review.rating,0)/rated.length*10)/10:0;
    p.reviews=rated.slice(-5).map(r=>r.data.review);
  }
  res.json({data:d.rank(profiles,f).slice(0,50),limited:profiles.length===500||reviews.length===5000});
}));
router.use(authenticate);
router.get('/me',wrap(async(req,res)=>res.json({profile:await result(db.from('construction_professionals').select(fields).eq('id',req.user.id).maybeSingle()),administrator:Boolean(await result(db.from('construction_admins').select('user_id').eq('user_id',req.user.id).maybeSingle())),user_id:req.user.id})));
router.put('/profile',wrap(async(req,res)=>res.json({data:await result(db.from('construction_professionals').upsert(profile(req.body,req.user.id)).select(fields).single())})));
router.get('/verification',wrap(async(req,res)=>{await admin(req.user.id);res.json({data:await result(db.from('construction_professionals').select(fields).order('updated_at',{ascending:false}).limit(200))});}));
router.post('/verification/:id',wrap(async(req,res)=>{
  await admin(req.user.id);
  if(!['verified','rejected','suspended'].includes(req.body.status)) d.fail('Invalid verification status.');
  await result(db.rpc('construction_verify',{p_id:req.params.id,p_actor:req.user.id,p_status:req.body.status,p_reference:d.text(req.body.reference,'Private verification case reference',250)}));
  res.json({success:true});
}));
router.put('/projects/:id/context',wrap(async(req,res)=>{
  await ownedProject(req.params.id,req.user.id);
  const context={start_date:d.date(req.body.start_date,'Planned start'),duration_months:d.number(req.body.duration_months,'Duration',1,120),parking:req.body.parking===true};
  if(req.body.lat!==''&&req.body.lat!=null) {context.lat=d.number(req.body.lat,'Latitude',-90,90);context.lng=d.number(req.body.lng,'Longitude',-180,180);}
  res.json({data:await result(db.from('projects').update({construction_context:context}).eq('project_id',req.params.id).eq('user_id',req.user.id).select('project_id,construction_context').single())});
}));
router.post('/requests',wrap(async(req,res)=>{
  const project=await ownedProject(req.body.project_id,req.user.id);
  const pro=await result(db.from('construction_professionals').select(fields).eq('id',req.body.professional_id).eq('verification','verified').maybeSingle());
  if(!pro||!pro.available) d.fail('This professional is not verified and available.',409);
  if(pro.id===req.user.id) d.fail('You cannot request your own services.');
  if(!d.rank([pro],{city:project.city||project.location,...project.construction_context,radius:500}).length) d.fail('Project is outside this professional’s service area.',409);
  if(!['quote','contact','site_visit'].includes(req.body.kind)) d.fail('Invalid request type.');
  const data={stage:'requested',kind:req.body.kind,scope:d.text(req.body.scope,'Project scope',4000),project_name:project.project_name,city:project.city||project.location,professional_name:pro.name,profession:pro.profession,requirements:{description:project.description,plot_size:project.plot_size,built_up_area:project.built_up_area,floors:project.floors,bedrooms:project.bedrooms,bathrooms:project.bathrooms,budget:project.budget,quality:project.quality_level,...project.construction_context},messages:[]};
  res.status(201).json({data:await result(db.from('construction_engagements').insert({project_id:project.project_id,customer_id:req.user.id,professional_id:pro.id,data}).select().single())});
}));
router.get('/engagements',wrap(async(req,res)=>{
  const [customer,professional]=await Promise.all([result(db.from('construction_engagements').select('*').eq('customer_id',req.user.id).order('updated_at',{ascending:false}).limit(100)),result(db.from('construction_engagements').select('*').eq('professional_id',req.user.id).order('updated_at',{ascending:false}).limit(100))]);
  res.json({data:[...customer,...professional]});
}));
router.get('/engagements/:id/events',wrap(async(req,res)=>{
  await engagement(req.params.id,req.user.id);
  res.json({data:await result(db.from('construction_events').select('id,actor_id,action,created_at').eq('engagement_id',req.params.id).order('id',{ascending:false}).limit(100))});
}));
router.post('/engagements/:id/actions',wrap(async(req,res)=>{
  const row=await engagement(req.params.id,req.user.id);
  if(req.body.version!==row.version) d.fail('Workflow changed. Refresh and retry.',409);
  const data=d.transition(row,req.body.action,req.body.input||{},req.user.id);
  res.json({data:await save(row,data,req.user.id,req.body.action)});
}));
router.post('/engagements/:id/payment-order',wrap(async(req,res)=>{
  const row=await engagement(req.params.id,req.user.id);
  if(row.customer_id!==req.user.id) d.fail('Only the customer can pay.',403);
  if(row.data.stage!=='payment') d.fail('Both participants must accept the contract before payment.',409);
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET||!process.env.RAZORPAY_WEBHOOK_SECRET) d.fail('Payments are not configured. No money has been charged.',503);
  if(row.data.payment?.order_id) return res.json({key:process.env.RAZORPAY_KEY_ID,...row.data.payment});
  if(row.data.payment?.status==='creating') d.fail('Order is being created or requires reconciliation. Contact support before retrying.',409);
  const claimed=await save(row,{...row.data,payment:{status:'creating',amount:Math.round(row.data.contract.quote.total*100),currency:'INR',purpose:'construction_contract'}},req.user.id,'payment_order_requested');
  const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(process.env.RAZORPAY_KEY_ID+':'+process.env.RAZORPAY_KEY_SECRET).toString('base64')},body:JSON.stringify({amount:claimed.data.payment.amount,currency:'INR',receipt:row.id,notes:{engagement_id:row.id,project_id:row.project_id}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok) d.fail('Payment provider could not create the order. Support must reconcile this request before retrying.',502);
  const order=await response.json();
  if(!order.id||order.amount!==claimed.data.payment.amount||order.currency!=='INR') d.fail('Unexpected payment provider response.',502);
  const saved=await save(claimed,{...claimed.data,payment:{...claimed.data.payment,order_id:order.id,status:'created'}},req.user.id,'payment_order_created');
  res.json({key:process.env.RAZORPAY_KEY_ID,...saved.data.payment});
}));
router.get('/notifications',wrap(async(req,res)=>res.json({data:await result(db.from('construction_notifications').select('*').eq('user_id',req.user.id).order('id',{ascending:false}).limit(50))})));
router.patch('/notifications/:id',wrap(async(req,res)=>{await result(db.from('construction_notifications').update({read_at:new Date().toISOString()}).eq('id',req.params.id).eq('user_id',req.user.id));res.json({success:true});}));
module.exports={router,webhook};

