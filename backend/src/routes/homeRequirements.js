'use strict';
const express=require('express'),crypto=require('node:crypto');
const {authenticate}=require('../middleware/auth');
const db=require('../config/supabase'),contract=require('../../../frontend/js/home-requirements-model');
const storage=require('../services/design3d/storage'),{validateUpload}=require('../services/design3d/specification');
const router=express.Router();router.use(authenticate);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const q=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
const wrap=f=>async(req,res)=>{try{await f(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Home requirements service unavailable. Your browser draft is retained.',fields:e.errors||undefined});}};
const { ensureContractorProfile } = require('../services/contractorProfile');
async function providerProfile(id,user){
 let p=await q(db.from('construction_professionals').select('id,name,profession,city,verification,available').eq('id',id).maybeSingle()).catch(()=>null);
 if(!p&&user) p=await ensureContractorProfile(user);
 if(!p) fail('Complete your construction provider profile in Services → For professionals before viewing client requests.',403);
 return p;
}
async function verifiedProfessional(id,user){
 const p=await providerProfile(id,user);
 if(p.verification!=='verified'||!p.available||!['Civil Contractor','General Contractor','Architect','Civil Engineer'].includes(p.profession)) fail('Your provider profile must be verified and available before accepting home requests.',403);
 return p;
}
function scope(p){const r=p.construction_context?.homeRequirements;return {projectId:p.project_id,projectName:p.project_name,city:p.city,createdAt:p.created_at,requirements:r?{plot:{lengthFt:r.plot.lengthFt,widthFt:r.plot.widthFt,areaSqFt:r.plot.areaSqFt,shape:r.plot.shape,roadFacing:r.plot.roadFacing},building:r.building,rooms:r.rooms,parking:r.parking,outdoor:r.outdoor,preferences:r.preferences,budget:r.budget,outputs:r.outputs}:null};}
router.post('/home-requirements',wrap(async(req,res)=>{
 const {values,roomSizes={},files=[],share=false,projectId,draftId}=req.body;
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(k=>!contract.fields.some(f=>f.key===k)))fail('Invalid requirements data.');
 if(!roomSizes||typeof roomSizes!=='object'||Array.isArray(roomSizes)||JSON.stringify(roomSizes).length>20000)fail('Invalid room dimensions.');
 if(typeof share!=='boolean')fail('Choose whether to share this request.');
 const requirements=contract.serialize(values,roomSizes);if(share&&!requirements.plot.location.city.trim())fail('Add your city before sharing with construction providers.');
 if(!Array.isArray(files)||files.length>2||new Set(files.map(f=>f.kind)).size!==files.length)fail('Attach at most one blueprint and one plot sketch.');
 const uploaded=files.map(f=>{if(!['blueprint','sketch'].includes(f.kind))fail('Invalid attachment type.');return {kind:f.kind,...validateUpload(f)};});if(uploaded.reduce((n,f)=>n+f.bytes.length,0)>6*1024*1024)fail('Keep combined attachments under 6 MB.');
 let existing=null;
 if(projectId){existing=await q(db.from('projects').select('*').eq('project_id',projectId).eq('user_id',req.user.id).maybeSingle());if(!existing)fail('Project not found.',404);}
 let id=projectId;
 if(!id){if(!/^[0-9a-f-]{36}$/i.test(draftId||''))fail('A draft identifier is required.');id='HOME-'+draftId;existing=await q(db.from('projects').select('*').eq('project_id',id).eq('user_id',req.user.id).maybeSingle());}
 const attachments=[];for(const f of uploaded){const key=await storage.put(`${req.user.id}/${id}/requirements/${crypto.randomUUID()}/${f.name}`,f.bytes,f.type);attachments.push({kind:f.kind,key,type:f.type});}
 const previous=existing?.construction_context||{};
 if(requirements.projectType==='existing_blueprint'&&!attachments.some(f=>f.kind==='blueprint')&&!previous.attachments?.some(f=>f.kind==='blueprint'))fail('Attach your existing blueprint.');
 if(['irregular','other'].includes(requirements.plot.shape)&&!attachments.some(f=>f.kind==='sketch')&&!previous.attachments?.some(f=>f.kind==='sketch'))fail('Attach a plot sketch for this plot shape.');
 const row={project_name:`${requirements.building.bedrooms}-bedroom home${requirements.plot.location.city?' · '+requirements.plot.location.city:''}`,city:requirements.plot.location.city,state:requirements.plot.location.state,district:requirements.plot.location.district,location:requirements.plot.location.city,plot_size:String(requirements.plot.areaSqFt),built_up_area:requirements.building.preferredBuiltUpAreaSqFt==null?'':String(requirements.building.preferredBuiltUpAreaSqFt),floors:requirements.building.floors,bedrooms:requirements.building.bedrooms,bathrooms:requirements.building.bathrooms,budget:requirements.budget.amount||0,quality_level:requirements.budget.package[0].toUpperCase()+requirements.budget.package.slice(1),description:'Structured home requirements submitted by the client.',construction_context:{...previous,homeRequirements:requirements,attachments:attachments.length?attachments:previous.attachments||[],requirementsPublished:share,requirementsUpdatedAt:new Date().toISOString()}};
 if(existing)await q(db.from('projects').update(row).eq('project_id',id).eq('user_id',req.user.id));else await q(db.from('projects').insert({...row,project_id:id,user_id:req.user.id}));
 res.status(existing?200:201).json({projectId:id,status:'saved',published:share,planningStatus:'not_started'});
}));
router.get('/home-leads',wrap(async(req,res)=>{
 const pro=await providerProfile(req.user.id,req.user);
 const rows=await q(db.from('projects').select('project_id,project_name,city,created_at,construction_context,user_id').eq('status','active').eq('construction_context->>requirementsPublished','true').ilike('city',pro.city.replace(/[%_]/g,'')).neq('user_id',req.user.id).order('created_at',{ascending:false}).limit(50));
 res.json({data:rows.map(scope)});
}));
router.post('/home-leads/:id/accept',wrap(async(req,res)=>{
 const pro=await verifiedProfessional(req.user.id,req.user),p=await q(db.from('projects').select('*').eq('project_id',req.params.id).eq('status','active').maybeSingle());
 if(!p||p.user_id===req.user.id||p.construction_context?.requirementsPublished!==true||p.city.trim().toLowerCase()!==pro.city.trim().toLowerCase())fail('This request is not available to your account.',404);
 const existing=await q(db.from('construction_engagements').select('id').eq('project_id',p.project_id).eq('professional_id',req.user.id).maybeSingle());if(existing)return res.json({engagementId:existing.id});
 const data={stage:'requested',kind:'contact',scope:'Provider accepted the published home requirement for discussion. Client selection and contract approval are still required.',project_name:p.project_name,city:p.city,professional_name:pro.name,profession:pro.profession,requirements:scope(p).requirements,provider_accepted_at:new Date().toISOString(),messages:[]};
 const result=await db.from('construction_engagements').insert({project_id:p.project_id,customer_id:p.user_id,professional_id:req.user.id,data}).select('id').single();
 if(result.error){if(result.error.code==='23505'){const found=await q(db.from('construction_engagements').select('id').eq('project_id',p.project_id).eq('professional_id',req.user.id).single());return res.json({engagementId:found.id});}throw result.error;}
 res.status(201).json({engagementId:result.data.id});
}));
module.exports=router;
