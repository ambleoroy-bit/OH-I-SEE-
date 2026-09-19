'use strict';
const d=require('./constructionDomain'),catalog=require('./roadmapCatalog'),{floorCount}=require('../../../frontend/js/requirements-step-model');
const need=(ok,msg)=>{if(!ok)d.fail(msg,409);};
function initial(project){
 const floors=floorCount(project.construction_context?.projectRequirements?.floors||project.floors||1);
 need(Number.isInteger(floors)&&floors<=100,'Invalid floor count.');
 return {grade:null,grade_approved:false,stages:catalog.stages.flatMap(s=>Array.from({length:s.per_floor?floors:1},(_,i)=>({id:s.id+(s.per_floor?'_'+i:''),catalog_id:s.id,floor:s.per_floor?i+1:null,status:'pending',measurements:[],curing:[]}))),snags:[],handover:null};
}
function apply(data,input,contractor,actor,at){
 const r=data.roadmap ||= initial(data.project);
 const own=()=>{if(!contractor)d.fail('Contractor action required.',403);};
 const client=()=>{if(contractor)d.fail('Customer approval required.',403);};
 need(!r.handover?.approved_at,'Handover is already signed off.');
 if(input.operation==='grade'){own();need(catalog.grades.includes(input.grade),'Choose one of the five grades.');need(!r.stages.some(s=>s.status!=='pending'),'Agree specification before site work.');r.grade=input.grade;r.specification=d.text(input.specification,'Approved drawing references, materials and exclusions',5000);r.grade_approved=false;return;}
 if(input.operation==='approve_grade'){client();need(r.grade&&r.specification,'Contractor must submit the specification first.');r.grade_approved=true;r.grade_approved_at=at;return;}
 need(r.grade_approved,'Customer must approve the material/finish specification first.');
 if(input.operation==='snag'){need(r.snags.length<500,'Snag register is full.');r.snags.push({id:require('node:crypto').randomUUID(),description:d.text(input.description,'Defect / room'),responsible:d.text(input.responsible,'Responsible person',150),due:d.date(input.due,'Correction date'),status:'open',by:actor,at});return;}
 if(input.operation==='resolve_snag'){own();const s=r.snags.find(s=>s.id===input.snag_id);need(s&&s.status==='open','Open snag required.');s.resolution=d.text(input.note,'Correction evidence');s.status='review';return;}
 if(input.operation==='close_snag'){client();const s=r.snags.find(s=>s.id===input.snag_id);need(s?.status==='review','Contractor must submit the correction first.');s.status='closed';return;}
 if(input.operation==='handover'){own();need(r.stages.every(s=>s.status==='recorded'),'Record every construction stage first.');need(r.snags.every(s=>s.status==='closed'),'Close all snags first.');r.handover={documents:d.text(input.documents,'Test reports, warranties, manuals, keys and as-built document references',6000),at};return;}
 if(input.operation==='approve_handover'){client();need(r.handover&&r.snags.every(s=>s.status==='closed'),'Complete handover and close all snags first.');r.handover.approved_at=at;r.handover.approved_by=actor;return;}
 const s=r.stages.find(s=>s.id===input.stage_id);need(s,'Choose a valid stage.');
 const spec=catalog.stages.find(x=>x.id===s.catalog_id);
 switch(input.operation){
 case 'draw':own();need(s.status==='pending','Stage already prepared.');s.drawing=d.text(input.note,'Current drawing / specification revision');s.status='drawn';break;
 case 'check':own();need(s.status==='drawn','Record drawings before inspection.');s.inspector=d.text(input.inspector,'Responsible engineer / inspector',150);s.check=d.text(input.note,'Inspection findings and hold-point evidence');s.status='checked';break;
 case 'approve':client();need(s.status==='checked','Inspection must be recorded before client approval.');s.status='approved';s.approved_at=at;break;
 case 'execute':{own();need(s.status==='approved','Draw, check and obtain approval before execution.');
 const index=catalog.stages.indexOf(spec);
 let previous=r.stages.filter(x=>catalog.stages.findIndex(c=>c.id===x.catalog_id)<index && !['columns','slab','masonry'].includes(x.catalog_id));
 if(s.catalog_id==='columns'&&s.floor>1)previous.push(r.stages.find(x=>x.catalog_id==='slab'&&x.floor===s.floor-1));
 if(s.catalog_id==='slab')previous.push(r.stages.find(x=>x.catalog_id==='columns'&&x.floor===s.floor));
 if(s.catalog_id==='masonry')previous.push(r.stages.find(x=>x.catalog_id==='slab'&&x.floor===s.floor));
 if(index>catalog.stages.findIndex(c=>c.id==='masonry'))previous.push(...r.stages.filter(x=>['columns','slab','masonry'].includes(x.catalog_id)));
 need(previous.every(x=>x&&['executed','recorded'].includes(x.status)),'Execute preceding work first. Floor structure follows columns then slab on each floor.');
 const cover={footing_steel:'pcc',plinth:'footing_concrete',plaster:'services',flooring:'waterproofing',painting:'plaster'};
 if(cover[s.catalog_id])need(r.stages.filter(x=>x.catalog_id===cover[s.catalog_id]).every(x=>x.status==='recorded'),'Complete predecessor curing/testing and records before covering the work.');
 if((s.catalog_id==='columns'&&s.floor>1)||s.catalog_id==='masonry')need(previous.filter(x=>x.catalog_id==='slab').every(x=>x.status==='recorded'),'Record slab curing and engineer clearance before loading or covering.');
 s.status='executed';s.executed_at=at;break;}
 case 'measure':{own();need(s.status==='executed','Execute the approved work before measurement.');need(s.measurements.length<100,'Measurement limit reached.');const unit=input.unit;need(['m3','m2','m','kg','tonne','point','circuit','item'].includes(unit),'Choose a measurement unit.');const dimensions={};let quantity;
 if(['m3','m2'].includes(unit)){dimensions.length=d.number(input.length,'Length (m)',0.001,100000);dimensions.width=d.number(input.width,'Width (m)',0.001,100000);dimensions.count=d.number(input.count||1,'Count',1,100000);if(unit==='m3')dimensions.depth=d.number(input.depth,'Depth / thickness (m)',0.001,10000);quantity=dimensions.length*dimensions.width*(dimensions.depth||1)*dimensions.count;}else quantity=d.number(input.quantity,'Measured quantity',0.001,1e9);
 s.measurements.push({description:d.text(input.note,'Measurement location / specification'),unit,quantity:Math.round(quantity*1000)/1000,dimensions,by:actor,at});break;}
 case 'curing':own();need(s.status==='executed','Record curing after execution.');need(s.curing.length<100,'Curing log limit reached.');const start=d.date(input.start,'Curing start'),end=d.date(input.end,'Required curing end');need(end>=start,'End date must follow start.');need(start>=s.executed_at.slice(0,10)&&start<=at.slice(0,10),'Curing / test start must be on or after recorded execution and not in the future.');s.curing.push({start,end,instructions:d.text(input.note,'Engineer / manufacturer curing instructions'),by:actor,at});break;
 case 'record':own();need(s.status==='executed'&&s.measurements.length,'Add measurements before completing the record.');if(spec.curing!=='None'){need(s.curing.length,'Add a curing/waiting or test record.');need(s.curing.every(c=>c.end<=at.slice(0,10)),'Required curing/waiting period has not ended.');}s.completion=d.text(input.note,'Completion evidence and engineer clearance (including tests / props / loading where applicable)');s.status='recorded';s.recorded_at=at;break;
 default:d.fail('Unknown roadmap action.');
 }
}
module.exports={catalog,initial,apply};
