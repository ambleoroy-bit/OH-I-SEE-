 'use strict';
const db=require('../config/supabase');
const d=require('./constructionDomain');
const m=require('./marketplaceDomain');
async function result(query) {
  const {data,error}=await query;
  if(error) {
    if(error.code==='23505') d.fail('This request already exists or another contractor budget has been approved. Refresh the project.',409);
    d.fail('Marketplace storage unavailable. Check database connectivity and apply marketplace_flow.sql.',503);
  }
  return data;
}
async function project(id,owner) {
  const row=await result(db.from('projects').select('*').eq('project_id',id).eq('user_id',owner).maybeSingle());
  if(!row) d.fail('Project not found.',404);
  return row;
}
async function profiles(kind) {
  const rows=await result(db.from('marketplace_profiles').select('*').eq('kind',kind).order('updated_at',{ascending:false}));
  const users=await result(db.from('users').select('*').in('role',['Partner','Supplier','Contractor','Vendor']));
  const eligible=users.filter(u=>m.eligible(u,kind));
  const filtered=rows.filter(r=>eligible.some(u=>u.id===r.user_id));
  for(const u of eligible) {
    if(u.company && u.city && !filtered.some(p=>p.user_id===u.id)) filtered.push({user_id:u.id,kind,company:u.company,city:u.city,scope:kind==='supplier'?'Registered supplier — catalog pending':'Scope and pricing not published yet',available:true});
  }
  return filtered.map(p=>({...p,profile_image:require('./userProfileStore').mergeUserProfile(eligible.find(u=>u.id===p.user_id))?.profile_image||''}));
}
async function savedProjects(user) {
  if(!m.eligible(user,'contractor')) d.fail('Contractor account required.',403);
  const profile=await result(db.from('marketplace_profiles').select('*').eq('user_id',user.id).maybeSingle());
  const city=String(user.city || profile?.city || '').trim();
  if(!city) return {city,data:[]};
  const rows=await result(db.from('projects').select('project_id,user_id,project_name,project_type,city,location,status,budget,estimated_cost,built_up_area,floors,construction_context,updated_at,selected_builder').order('updated_at',{ascending:false}));
  const jobs=await result(db.from('marketplace_jobs').select('project_id'));
  const assigned=new Set(jobs.map(j=>j.project_id));
  const data=rows.filter(p=>p.user_id!==user.id && !assigned.has(p.project_id) && !p.selected_builder && !['cancelled','archived','completed','in_execution'].includes(String(p.status).toLowerCase()) && m.projectFacts(p).city.toLowerCase()===city.toLowerCase()).map(p=>{
    const f=m.projectFacts(p);
    // Explicit summary only: never return customer contact, documents or raw wizard data.
    return {project_id:p.project_id,project_name:p.project_name,project_type:p.project_type,city:f.city,status:p.status||'draft',area:f.area,budget:f.budget,estimate:f.estimate,floors:p.floors,updated_at:p.updated_at};
  });
  return {city,data};
}
async function savedProjectDetails(id,user) {
  const listing=await savedProjects(user);
  if(!listing.data.some(p=>p.project_id===id)) d.fail('Saved project not found in your service city.',404);
  const p=await result(db.from('projects').select('*').eq('project_id',id).maybeSingle());
  if(!p) d.fail('Saved project not found.',404);
  const fields=['project_id','project_name','project_type','client_name','description','intent_type','status','city','state','district','location','pincode','latitude','longitude','survey_number','plot_size','plot_length','plot_width','road_facing','facing_direction','built_up_area','floors','bedrooms','bathrooms','parking_count','has_pooja','has_office','has_terrace','vastu_preference','architectural_style','quality_level','budget','estimated_cost','start_date','target_completion_date','last_saved_at'];
  const details=Object.fromEntries(fields.filter(k=>p[k]!=null).map(k=>[k,p[k]]));
  const ctx=p.construction_context||{};
  details.construction_context=Object.fromEntries(['projectSetup','landSite','projectRequirements','intentAnswers'].filter(k=>ctx[k]).map(k=>[k,ctx[k]]));
  return details;
}
async function comparison(id,owner) {
  const p=await project(id,owner), facts=m.projectFacts(p);
  const jobs=await result(db.from('marketplace_jobs').select('*').eq('project_id',id).eq('customer_id',owner));
  const registered=await profiles('contractor');
  const quotes=m.compare(registered,p);
  const builders=registered.filter(b=>String(b.city).trim().toLowerCase()===facts.city.toLowerCase()).map(b=>({contractor_id:b.user_id,profile_image:b.profile_image,company:b.company,city:b.city,scope:b.scope,available:b.available,rate_min:b.rate_min||null,rate_max:b.rate_max||null,pricing_ready:Number(b.rate_min)>0 && Number(b.rate_max)>=Number(b.rate_min)}));
  const requests=await Promise.all(jobs.map(j=>job(j.id,owner)));
  return {quotes,builders,facts,requests,job:jobs[0]?await job(jobs[0].id,owner):null,project:p,selections:jobs.map(j=>({quote_ref:j.contractor_id,builder_name:j.data.builder_name,status:j.data.stage==='requested'?'pending_builder_acceptance':'confirmed'}))};
}
async function select(id,owner,input) {
  const p=await project(id,owner);
  if(!input.request_only) m.validateProject(p);
  const registered=await profiles('contractor');
  const target=registered.find(b=>b.user_id===(input.contractor_id||input.quote_ref) && b.available && String(b.city).trim().toLowerCase()===m.projectFacts(p).city.toLowerCase());
  const c=m.compare(registered,p).find(c=>c.contractor_id===(input.contractor_id||input.quote_ref)) || (input.request_only && target ? {contractor_id:target.user_id,builder_name:target.company,estimate_min:null,estimate_max:null}:null);
  if(!c || c.contractor_id===owner) d.fail('Select an available registered builder with a completed price range.',400);
  const existing=await result(db.from('marketplace_jobs').select('*').eq('project_id',id).eq('contractor_id',c.contractor_id).maybeSingle());
  if(existing) {
    if(existing.customer_id===owner && existing.contractor_id===c.contractor_id) return existing;
    d.fail('A builder is already selected. Resolve the existing lead before selecting another.',409);
  }
  const at=new Date().toISOString();
  return result(db.from('marketplace_jobs').insert({project_id:id,customer_id:owner,contractor_id:c.contractor_id,data:{stage:'requested',builder_name:c.builder_name,project:p,estimate:c,messages:[{author:owner,text:'New client lead: please review my project requirements and estimate.',at}],events:[{action:'selected',actor:owner,at}],unread_for:c.contractor_id}}).select('*').single());
}
async function job(id,actor) {
  const row=await result(db.from('marketplace_jobs').select('*').eq('id',id).maybeSingle());
  if(!row || ![row.customer_id,row.contractor_id].includes(actor)) d.fail('Project lead not found.',404);
  if(actor===row.customer_id && row.data.accepted_at) {
    const builder=await result(db.from('users').select('email,phone').eq('id',row.contractor_id).maybeSingle());
    row.contact={email:builder?.email||null,phone:builder?.phone||null};
  }
  return row;
}
async function save(row,data) {
  const updated=await result(db.from('marketplace_jobs').update({data,version:row.version+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('version',row.version).select('*').maybeSingle());
  if(!updated) d.fail('This project changed. Refresh and retry.',409);
  return updated;
}
async function action(id,user,input) {
  const row=await job(id,user.id);
  if(input.version!==row.version) d.fail('This project changed. Refresh and retry.',409);
  const contractor=row.contractor_id===user.id, data=structuredClone(row.data), at=new Date().toISOString();
  const need=(ok,message)=>{if(!ok)d.fail(message,409);};
  const requireRole=ok=>{if(!ok)d.fail('Action not permitted for this account.',403);};
  switch(input.action) {
    case 'roadmap':
      need(['estimating','proposal_sent','revision_requested','approved','in_execution'].includes(data.stage),'Accept the contractor request first.');
      if(!['grade','approve_grade'].includes(input.operation))need(data.stage==='in_execution','Start the customer-approved project before managing site work.');
      if(input.operation==='grade')need(['estimating','revision_requested'].includes(data.stage)||!data.roadmap?.grade,'Request a budget revision before changing the agreed specification.');
      requireRole(!contractor || m.eligible(user,'contractor'));
      require('./roadmapService').apply(data,input,contractor,user.id,at);break;
    case 'read': if(data.unread_for===user.id) data.unread_for=null; return save(row,data);
    case 'message':
      need(data.messages.length<500,'Conversation limit reached.');
      data.messages.push({author:user.id,text:d.text(input.text,'Message',2000),at});break;
    case 'accept':
      requireRole(contractor && m.eligible(user,'contractor')); need(data.stage==='requested','Lead has already been reviewed.');
      data.stage='estimating'; data.accepted_at=at;break;
    case 'proposal': {
      requireRole(contractor && m.eligible(user,'contractor')); need(['estimating','proposal_sent','revision_requested'].includes(data.stage),'Accept the lead before sending a proposal.');
      need(data.roadmap?.grade_approved,'Agree the five-grade specification with the customer before submitting a budget.');
      const suppliers=await profiles('supplier');
      const ids=Array.isArray(input.items)?input.items.map(i=>i.product_id):[];
      const products=ids.length?await result(db.from('marketplace_products').select('*').in('id',ids)):[];
      data.proposal={...m.proposal(input,products,suppliers,m.projectFacts(data.project)),grade:data.roadmap.grade,specification:data.roadmap.specification};
      data.stage='proposal_sent'; break;
    }
    case 'approve':
      requireRole(!contractor);need(data.stage==='proposal_sent','A submitted proposal is required.');
      need(input.confirm_total===data.proposal.total,'Confirm the current proposal total.');
      data.stage='approved';data.approved_at=at; break;
    case 'revise':
      requireRole(!contractor);need(data.stage==='proposal_sent','A submitted proposal is required.');
      data.stage='revision_requested';data.messages.push({author:user.id,text:d.text(input.text,'Requested changes'),at});break;
    case 'start':
      requireRole(contractor && m.eligible(user,'contractor'));need(data.stage==='approved','Customer must approve the itemized budget first.');data.stage='in_execution';data.started_at=at;break;
    default:d.fail('Unknown action.');
  }
  need((data.events||[]).length<1000,'Project event limit reached.');
  data.events.push({action:input.action,actor:user.id,at});
  data.unread_for=contractor?row.customer_id:row.contractor_id;
  return save(row,data);
}
module.exports={savedProjectDetails,savedProjects,result,project,profiles,comparison,select,job,save,action};
