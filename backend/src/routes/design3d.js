'use strict';
const express=require('express'),crypto=require('node:crypto');
const {authenticate}=require('../middleware/auth');
const db=require('../config/supabase');
const {validateInput,validateUpload,renderOptions,fail}=require('../services/design3d/specification');
const storage=require('../services/design3d/storage');
const router=express.Router();
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function query(q){const {data,error}=await q;if(error){const e=new Error(error.code==='P0002'?'Project or version not found.':['40001','23505'].includes(error.code)?'This project is busy or changed. Refresh before retrying.':error.code==='22023'?error.message:'3D project storage is unavailable. Check database setup.');e.status=error.code==='P0002'?404:['40001','23505'].includes(error.code)?409:error.code==='22023'?400:503;throw e;}return data;}
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('[3D API]',e.code||'',e.message);res.status(e.status||503).json({error:e.status?e.message:'3D service unavailable. Your saved project is retained.',code:e.code||'SERVICE_UNAVAILABLE'});}};
async function owned(id,user){if(!uuid(id))fail('Project not found.',404);const p=await query(db.from('oh3d_projects').select('*').eq('id',id).eq('user_id',user).maybeSingle());if(!p)fail('Project not found.',404);return p;}
async function publicVersion(p,v){const links=await storage.urls(p,v);return {versionId:v.id,version:v.version,status:v.status,specification:v.specification,createdAt:v.created_at,prompt:v.prompt,renders:Object.fromEntries(Object.entries(links).filter(([k])=>!['model','project'].includes(k))),model:links.model||null,project:links.project||null};}
router.use(authenticate);
router.use((req,res,next)=>{if(!uuid(req.user.id))return res.status(401).json({error:'A valid signed-in account is required.'});next();});
router.get('/capabilities',wrap(async(req,res)=>{const leases=await query(db.from('oh3d_worker_leases').select('lease_until').gt('lease_until',new Date().toISOString()).limit(1));res.json({aiConfigured:!!process.env.OPENAI_API_KEY,workerAvailable:leases.length>0,maxUploadMB:6});}));
router.post('/projects',wrap(async(req,res)=>{
 const {prompt,inputs}=validateInput(req.body),upload=validateUpload(req.body.upload),id=crypto.randomUUID();
 if(upload){const key=`${req.user.id}/${id}/input/${upload.name}`;await storage.put(key,upload.bytes,upload.type);inputs.upload={key,type:upload.type};}
 const p=await query(db.from('oh3d_projects').insert({id,user_id:req.user.id,prompt,inputs}).select('*').single());
 res.status(201).json({projectId:p.id,status:p.status,currentVersion:0});
}));
router.get('/projects',wrap(async(req,res)=>{const rows=await query(db.from('oh3d_projects').select('id,prompt,status,current_version,updated_at').eq('user_id',req.user.id).order('updated_at',{ascending:false}).limit(50));res.json({projects:rows.map(p=>({projectId:p.id,prompt:p.prompt,status:p.status,currentVersion:p.current_version,updatedAt:p.updated_at}))});}));
router.get('/projects/:projectId',wrap(async(req,res)=>{
 const p=await owned(req.params.projectId,req.user.id);
 const jobs=await query(db.from('oh3d_jobs').select('id,status,progress,message,error_code,version_id').eq('project_id',p.id).order('created_at',{ascending:false}).limit(1));
 const v=p.current_version?await query(db.from('oh3d_versions').select('*').eq('project_id',p.id).eq('version',p.current_version).single()):null;
 res.json({projectId:p.id,prompt:p.prompt,status:jobs[0]?.status||p.status,currentVersion:p.current_version,specification:p.specification,jobId:jobs[0]?.id||null,result:v?await publicVersion(p,v):null});
}));
async function enqueue(req,res,operation){
 const p=await owned(req.params.projectId,req.user.id),key=req.body.requestId;
 if(!uuid(key))fail('A unique requestId is required.');
 if(!Number.isInteger(req.body.currentVersion))fail('The current project version is required.');
 const prompt=operation==='modify'||(operation==='generate'&&req.body.prompt)?validateInput(req.body).prompt:p.prompt;
 const result=await query(db.rpc('oh3d_enqueue',{p_project:p.id,p_user:req.user.id,p_expected:req.body.currentVersion,p_operation:operation,p_prompt:prompt,p_key:key,p_options:renderOptions(req.body.render),p_base:operation==='retry_render'?req.body.versionId:null}));
 const j=Array.isArray(result)?result[0]:result;
 res.status(202).json({jobId:j.id,projectId:p.id,status:j.status,progress:j.progress});
}
router.post('/projects/:projectId/generate',wrap((req,res)=>enqueue(req,res,'generate')));
router.post('/projects/:projectId/modify',wrap((req,res)=>enqueue(req,res,'modify')));
router.post('/projects/:projectId/retry-render',wrap(async(req,res)=>{if(!uuid(req.body.versionId))fail('Select a saved version.');await enqueue(req,res,'retry_render');}));
router.get('/jobs/:jobId',wrap(async(req,res)=>{
 if(!/^OH3D-\d{8}-\d{8,}$/.test(req.params.jobId))fail('Job not found.',404);
 const j=await query(db.from('oh3d_jobs').select('*').eq('id',req.params.jobId).eq('user_id',req.user.id).maybeSingle());if(!j)fail('Job not found.',404);
 const p=await owned(j.project_id,req.user.id),v=await query(db.from('oh3d_versions').select('*').eq('id',j.version_id).single());
 res.json({jobId:j.id,projectId:j.project_id,versionId:j.version_id,status:j.status,progress:j.progress,message:j.message,code:j.error_code,...(['completed','failed'].includes(j.status)?await publicVersion(p,v):{})});
}));
router.get('/projects/:projectId/versions',wrap(async(req,res)=>{const p=await owned(req.params.projectId,req.user.id);const rows=await query(db.from('oh3d_versions').select('*').eq('project_id',p.id).order('version',{ascending:false}));res.json({currentVersion:p.current_version,versions:await Promise.all(rows.map(v=>publicVersion(p,v)))});}));
router.post('/projects/:projectId/versions/:versionId/restore',wrap(async(req,res)=>{
 const p=await owned(req.params.projectId,req.user.id);if(!uuid(req.params.versionId)||!Number.isInteger(req.body.currentVersion))fail('Invalid version.');
 const row=await query(db.rpc('oh3d_restore',{p_project:p.id,p_user:req.user.id,p_version:req.params.versionId,p_expected:req.body.currentVersion}));res.json({projectId:p.id,currentVersion:row.current_version,status:row.status});
}));
router.get('/projects/:projectId/renders',wrap(async(req,res)=>{const p=await owned(req.params.projectId,req.user.id);if(!p.current_version)return res.json({renders:{}});const v=await query(db.from('oh3d_versions').select('*').eq('project_id',p.id).eq('version',p.current_version).single());res.json(await publicVersion(p,v));}));
router.get('/artifacts/:projectId/:versionId/:kind',wrap(async(req,res)=>{
 const p=await owned(req.params.projectId,req.user.id);if(!uuid(req.params.versionId)||!['exterior','livingRoom','kitchen','masterBedroom','model','project'].includes(req.params.kind))fail('Artifact not found.',404);
 const v=await query(db.from('oh3d_versions').select('artifacts').eq('id',req.params.versionId).eq('project_id',p.id).maybeSingle());const key=v?.artifacts?.[req.params.kind];if(!key)fail('Artifact not found.',404);
 const file=await storage.local(key);res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.sendFile(file);
}));
module.exports={router,owned,query};
