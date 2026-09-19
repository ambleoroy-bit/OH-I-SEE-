 'use strict';
const express=require('express'),db=require('../config/supabase');
const {authenticate}=require('../middleware/auth');
const d=require('../services/constructionDomain'),m=require('../services/marketplaceDomain'),s=require('../services/marketplaceService');
const router=express.Router();
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||500).json({error:e.status?e.message:'Could not complete the marketplace request.'});}};
router.use(authenticate);
router.get('/roadmap-catalog',wrap(async(req,res)=>res.json(require('../services/roadmapCatalog'))));
router.get('/me',wrap(async(req,res)=>res.json({user:{id:req.user.id,name:req.user.name,company:req.user.company,city:req.user.city,kind:m.accountKind(req.user)},profile:await s.result(db.from('marketplace_profiles').select('*').eq('user_id',req.user.id).maybeSingle()),categories:m.categories})));
router.put('/profile',wrap(async(req,res)=>res.json({data:await s.result(db.from('marketplace_profiles').upsert(m.profile(req.body,req.user),{onConflict:'user_id'}).select('*').single())})));
router.get('/projects/:id/comparison',wrap(async(req,res)=>res.json({data:await s.comparison(req.params.id,req.user.id)})));
router.post('/projects/:id/request',wrap(async(req,res)=>res.status(201).json({data:await s.select(req.params.id,req.user.id,{contractor_id:req.body.contractor_id,request_only:true})})));
router.post('/projects/:id/select',wrap(async(req,res)=>res.status(201).json({data:await s.select(req.params.id,req.user.id,req.body)})));
router.get('/saved-projects/:id',wrap(async(req,res)=>res.json({data:await s.savedProjectDetails(req.params.id,req.user)})));
router.get('/saved-projects',wrap(async(req,res)=>res.json(await s.savedProjects(req.user))));
router.get('/jobs',wrap(async(req,res)=>{
 const column=m.accountKind(req.user)==='contractor'?'contractor_id':'customer_id';
 res.json({data:await s.result(db.from('marketplace_jobs').select('*').eq(column,req.user.id).order('updated_at',{ascending:false}))});
}));
router.get('/jobs/:id',wrap(async(req,res)=>res.json({data:await s.job(req.params.id,req.user.id)})));
router.post('/jobs/:id/actions',wrap(async(req,res)=>res.json({data:await s.action(req.params.id,req.user,req.body)})));
router.get('/suppliers',wrap(async(req,res)=>{
 if(!m.eligible(req.user,'contractor'))d.fail('Contractor account required.',403);
 res.json({data:(await s.profiles('supplier')).filter(p=>p.available)});
}));
router.get('/suppliers/:id/products',wrap(async(req,res)=>{
 if(!m.eligible(req.user,'contractor') && req.params.id!==req.user.id)d.fail('Contractor or catalog owner required.',403);
 const suppliers=await s.profiles('supplier');
 if(!suppliers.some(p=>p.user_id===req.params.id))d.fail('Registered supplier profile not found.',404);
 res.json({data:await s.result(db.from('marketplace_products').select('*').eq('supplier_id',req.params.id).order('name'))});
}));
router.post('/products',wrap(async(req,res)=>{
 if(!m.eligible(req.user,'supplier'))d.fail('Supplier account required.',403);
 const p=await s.result(db.from('marketplace_profiles').select('*').eq('user_id',req.user.id).eq('kind','supplier').maybeSingle());
 if(!p)d.fail('Complete your company profile before adding products.');
 res.status(201).json({data:await s.result(db.from('marketplace_products').insert(m.product(req.body,req.user.id)).select('*').single())});
}));
router.put('/products/:id',wrap(async(req,res)=>{
 if(!m.eligible(req.user,'supplier'))d.fail('Supplier account required.',403);
 const row=await s.result(db.from('marketplace_products').update(m.product(req.body,req.user.id)).eq('id',req.params.id).eq('supplier_id',req.user.id).select('*').maybeSingle());
 if(!row)d.fail('Product not found.',404);res.json({data:row});
}));
module.exports=router;
