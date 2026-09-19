 'use strict';
const d = require('./constructionDomain');
const roomModel = require('../../../frontend/js/requirements-step-model');
const categories = ['Cement', 'Bricks & Blocks', 'Steel', 'Sand & Aggregates', 'Plumbing', 'Electrical', 'Flooring', 'Paint', 'Doors & Windows', 'Waterproofing', 'Fixtures', 'Other'];
const money = n => Math.round(n * 100) / 100;
function accountKind(user) {
  if (['Contractor','Vendor'].includes(user.role) || (user.role === 'Partner' && ['Contractor','Vendor'].includes(user.partner_type))) return 'contractor';
  if (user.role === 'Supplier' || (user.role === 'Partner' && ['Supplier','Distributor','Manufacturer'].includes(user.partner_type))) return 'supplier';
  return null;
}
function eligible(user, kind) { return accountKind(user) === kind && !['rejected','suspended','blocked'].includes(String(user.partner_status || '').toLowerCase()); }
function profile(input, user) {
  const kind = accountKind(user);
  if (!kind || !eligible(user, kind)) d.fail('A registered contractor or supplier account is required.', 403);
  const row = { user_id:user.id, kind, company:d.text(input.company, 'Company',150), city:d.text(input.city,'Service city',100), scope:d.text(input.scope,'Included scope / supplied categories',2000), available:input.available !== false, updated_at:new Date().toISOString() };
  if (kind === 'contractor') {
    row.rate_min = d.number(input.rate_min,'Minimum price per sq.ft',1,1000000);
    row.rate_max = d.number(input.rate_max,'Maximum price per sq.ft',row.rate_min,1000000);
  }
  return row;
}
function numeric(value) { const n = Number(String(value ?? '').replace(/,/g,'').replace(/\s*sq\.?\s*ft.*$/i,'')); return Number.isFinite(n) && n > 0 ? n : 0; }
function projectFacts(project) {
  const c=project.construction_context || {}, r=c.projectRequirements || c.intentAnswers || {}, s=c.projectSetup || {};
  return {area:numeric(r.built_up_area || project.built_up_area || s.built_up_area), budget:numeric(project.budget || s.estimated_budget), estimate:numeric(project.estimated_cost || project.boq_data?.total_cost), city:String(project.city || s.city || project.location?.split(',')[0] || '').trim(), requirements:r, land:c.landSite || {plot_length_ft:project.plot_length,plot_width_ft:project.plot_width}};
}
function compare(profiles, project) {
  const facts=projectFacts(project);
  if (!facts.area || !facts.city) return [];
  return profiles.filter(p=>p.available && p.rate_min > 0 && p.rate_max >= p.rate_min && p.city.toLowerCase()===facts.city.toLowerCase()).map(p=> {
    const low=money(facts.area*p.rate_min), high=money(facts.area*p.rate_max);
    return {id:p.user_id,contractor_id:p.user_id,quote_ref:p.user_id,builder_name:p.company,company_name:p.company,city:p.city,rate_min:Number(p.rate_min),rate_max:Number(p.rate_max),total_amount:low,estimate_min:low,estimate_max:high,estimate_only:true,scope:p.scope,verification_status:'Registered account',budget_fit:!facts.budget?'Budget not set':high<=facts.budget?'Within budget':low<=facts.budget?'Partly within budget':'Over budget',budget_gap:facts.budget?money(Math.max(0,low-facts.budget)):null,estimate_difference:facts.estimate?money(low-facts.estimate):null};
  }).sort((a,b)=> (a.budget_gap??0)-(b.budget_gap??0) || a.estimate_max-b.estimate_max || a.id.localeCompare(b.id)).map((p,i)=>({...p,recommendation:i===0?'Closest budget fit by published range':''}));
}
function validateProject(project) {
  const f=projectFacts(project);
  const r={...f.requirements,built_up_area:f.requirements.built_up_area || f.area,floors:f.requirements.floors || project.floors};
  const area=roomModel.areaValidation(r,f.land);
  if(Object.keys(area.errors).length) d.fail(Object.values(area.errors).join(' '));
  return f;
}
function product(input, userId) {
  if(!categories.includes(input.category)) d.fail('Choose a material category.');
  return {supplier_id:userId,name:d.text(input.name,'Product name',150),brand:String(input.brand||'').slice(0,100),category:input.category,unit:d.text(input.unit,'Unit',30),price:d.number(input.price,'Unit price',0.01,10000000),stock:d.number(input.stock,'Available quantity',0,100000000),active:input.active!==false,updated_at:new Date().toISOString()};
}
function proposal(input, products, suppliers, facts) {
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>200) d.fail('Provide 1–200 material items.');
  const seen=new Set();
  const items=input.items.map(i=> {
    if(seen.has(i.product_id)) d.fail('Combine duplicate products into one quantity.');
    seen.add(i.product_id);
    const p=products.find(p=>p.id===i.product_id && p.active);
    const supplier=p && suppliers.find(s=>s.user_id===p.supplier_id && s.available);
    if(!p||!supplier) d.fail('A selected product or registered supplier is no longer available.',409);
    const quantity=d.number(i.quantity,'Quantity',0.01,100000000);
    if(quantity>Number(p.stock)) d.fail(`Insufficient listed stock for ${p.name}.`,409);
    return {product_id:p.id,supplier_id:p.supplier_id,company:supplier.company,name:p.name,brand:p.brand,category:p.category,unit:p.unit,quantity,rate:Number(p.price),total:money(quantity*Number(p.price))};
  });
  const materials=money(items.reduce((s,i)=>s+i.total,0));
  const labour=d.number(input.labour,'Labour',0,100000000),other=d.number(input.other,'Other costs',0,100000000),tax_percent=d.number(input.tax_percent,'Tax percentage',0,30),contingency_percent=d.number(input.contingency_percent,'Contingency percentage',0,30);
  const subtotal=money(materials+labour+other),tax=money(subtotal*tax_percent/100),contingency=money(subtotal*contingency_percent/100),total=money(subtotal+tax+contingency);
  const exclusions=d.text(input.exclusions,'Scope, exclusions and other cost details',4000);
  const uncovered=categories.filter(c=>c!=='Other'&&!items.some(i=>i.category===c));
  return {items,materials,labour,other,tax_percent,contingency_percent,subtotal,tax,contingency,total,budget:facts.budget,variance:money(total-facts.budget),uncovered,exclusions,duration_days:d.number(input.duration_days,'Duration in days',1,3650),sent_at:new Date().toISOString()};
}
module.exports={categories,money,accountKind,eligible,profile,numeric,projectFacts,compare,validateProject,product,proposal};
