const root=document.querySelector('#construction-app'),view=document.querySelector('#cw-view'),dialog=document.querySelector('#cw-dialog'),status=document.querySelector('#cw-status');
const base=import.meta.env.VITE_API_BASE||(['localhost','127.0.0.1'].includes(location.hostname)?location.protocol+'//'+location.hostname+':3001/api':'/api');
const state={projects:[],selected:null,professionals:[],compare:new Set(),engagements:[],me:null};
const professions=['Civil Contractor','General Contractor','Plumber','Electrician','Civil Engineer','Architect','Structural Engineer','Interior Designer'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(v||0));
const btn=(label,action,id='',primary=false)=>'<button type="button" data-action="'+action+'" data-id="'+esc(id)+'" class="'+(primary?'primary':'')+'">'+esc(label)+'</button>';
const field=(label,name,type='text',value='',extra='')=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
const select=(label,name,values,value='')=>'<label>'+esc(label)+'<select name="'+name+'">'+values.map(v=>'<option '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>';
const area=(label,name,value='',extra='')=>'<label class="cw-wide">'+esc(label)+'<textarea name="'+name+'" '+extra+'>'+esc(value)+'</textarea></label>';
const empty=t=>'<div class="cw-empty">'+esc(t)+'</div>';
function notice(t){status.textContent=t;}
function login(){if(!localStorage.getItem('ohisee_jwt'))throw Error('Please sign in using Account to save projects and manage requests.');}
async function api(path,method='GET',body){
 const token=localStorage.getItem('ohisee_jwt');
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const data=await r.json();if(!r.ok)throw Error(r.status===401?'Please sign in to continue.':data.error||'Request failed.');return data;
}
const call=(path,method,body)=>api('/construction'+path,method,body);
function modal(title,content,submit){
 document.querySelector('#cw-dialog-content').innerHTML='<h2>'+esc(title)+'</h2><form id="cw-modal"><div class="cw-fields">'+content+'</div><p id="cw-modal-error" role="alert"></p><div class="cw-actions">'+(submit?'<button class="primary">Save & continue</button>':'')+'<button type="button" id="cw-close">Close</button></div></form>';
 dialog.showModal();document.querySelector('#cw-close').onclick=()=>dialog.close();
 document.querySelector('#cw-modal').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await submit(Object.fromEntries(new FormData(e.target)));dialog.close();}catch(err){document.querySelector('#cw-modal-error').textContent=err.message;}finally{e.submitter.disabled=false;}};
}
async function account(){login();state.me=await call('/me');document.querySelector('#cw-admin-tab').hidden=!state.me.administrator;}
async function projects(){login();state.projects=(await api('/projects')).data;if(state.selected)state.selected=state.projects.find(p=>p.project_id===state.selected.project_id)||null;}
function boqHtml(b){return '<div class="cw-status">Professional review required. This is not an approved design or contractor quotation.</div><p>'+esc(b.summary||b.note)+'</p><h3>'+money(b.totalEstimate)+'</h3><div class="cw-scroll"><table><tr><th>Item</th><th>Quantity</th><th>Amount</th></tr>'+(b.categories||[]).flatMap(c=>(c.items||[]).map(i=>'<tr><td>'+esc(i.description)+'</td><td>'+esc(i.qty)+' '+esc(i.unit)+'</td><td>'+money(i.amount)+'</td></tr>')).join('')+'</table></div>';}
function renderProject(){
 const p=state.selected,c=p?.construction_context||{};
 view.innerHTML='<div class="cw-grid"><section class="cw-panel"><div class="cw-eyebrow">Start with your idea</div><h2>What would you like to build?</h2><p>Share the basics and plan your next steps with your team.</p>'+
 (localStorage.getItem('ohisee_jwt')?'<label>Continue an existing project<select id="cw-picker"><option value="">Choose a project</option>'+state.projects.map(x=>'<option value="'+esc(x.project_id)+'" '+(p?.project_id===x.project_id?'selected':'')+'>'+esc(x.project_name)+' · '+esc(x.project_id)+'</option>').join('')+'</select></label>':'<p><a class="cw-button" href="login.html">Sign in to save your project</a></p>')+
 '<form id="cw-project-form"><div class="cw-fields">'+field('Project name','project_name','text',p?.project_name||'My new home','required maxlength="120"')+
 field('Project city','city','text',p?.city||'Coimbatore','required maxlength="100"')+area('Tell us what you have in mind','description',p?.description||'I want to build a house','required maxlength="2000"')+
 field('Plot area (sq ft)','plot_size','number',p?.plot_size||'','min="1" required')+field('Built-up area (sq ft)','built_up_area','number',p?.built_up_area||'','min="1" required')+
 field('Floors','floors','number',p?.floors||1,'min="1" max="50" required')+field('Bedrooms','bedrooms','number',p?.bedrooms??3,'min="0" max="100" required')+
 field('Bathrooms','bathrooms','number',p?.bathrooms??2,'min="0" max="100" required')+field('Budget (₹)','budget','number',p?.budget||'','min="1" max="1000000000" required')+
 select('Quality preference','quality_level',['Economic','Standard','Premium','Custom'],p?.quality_level||'Standard')+
 field('Planned start','start_date','date',c.start_date||'','required')+field('Duration (months)','duration_months','number',c.duration_months||12,'min="1" max="120" required')+
 '<label><input name="parking" type="checkbox" '+(c.parking?'checked':'')+'>Parking required</label><details class="cw-wide"><summary>Exact location for distance matching (optional)</summary><div class="cw-fields">'+
 field('Latitude','lat','number',c.lat??'','min="-90" max="90" step="any"')+field('Longitude','lng','number',c.lng??'','min="-180" max="180" step="any"')+'</div><p class="cw-note">Without coordinates, discovery uses the city. Distances are never guessed.</p></details></div>'+
 '<div class="cw-actions"><button class="primary">'+(p?'Save requirements':'Create project')+' →</button>'+(p?btn('New project','new-project'):'')+'</div></form></section>'+
 '<section class="cw-panel"><div class="cw-eyebrow">Your project plan</div><h2>'+esc(p?.project_name||'A clear path to construction')+'</h2><p>'+esc(p?p.project_id+' · '+p.city:'One project connects requirements, planning, professionals and progress.')+'</p>'+
 '<ol class="cw-steps"><li class="current">Requirements</li><li>Planning</li><li>Your team</li></ol><h3>The people a house project usually needs</h3><div class="cw-chips">'+professions.slice(0,7).map(x=>'<span class="cw-chip">'+esc(x)+'</span>').join('')+'</div>'+
 '<p class="cw-note">Residential-project suggestions. You can choose a different profession when searching.</p><h3>Planning & professional review</h3><p>Generate a preliminary BOQ. Architectural, electrical and plumbing designs require review by qualified professionals.</p><div class="cw-actions">'+btn('Generate preliminary BOQ','boq','',true)+btn('Find my project team','find-team')+'</div><div id="cw-boq">'+(p?.boq_data&&Object.keys(p.boq_data).length?boqHtml(p.boq_data):'')+'</div>'+
 '<details><summary>Connected construction workspace</summary><p>Compare quotes, agree a contract, verify payment and follow construction tasks. Engine 12 provides execution tracking; Engine 11 maintains project state and history.</p><p class="cw-note">Automated design synchronization is not connected.</p></details></section></div>';
}
function renderProfessionals(){
 view.innerHTML='<h2>Find the right people for your project</h2><p>Reviewed profiles. Explainable matching. Quotes for your exact scope.</p><div class="cw-search"><form id="cw-search-form" class="cw-panel cw-filter"><h3>Project & filters</h3>'+
 select('Profession','profession',['',...professions])+field('Project city','city','text',state.selected?.city||'Coimbatore','required')+
 field('Maximum distance (km)','radius','number',50,'min="1" max="500"')+field('Minimum rating','rating','number',0,'min="0" max="5" step=".5"')+
 field('Experience (years)','experience','number',0,'min="0" max="80"')+field('Completed projects','completed','number',0,'min="0"')+
 field('Maximum indicative rate (₹)','price','number','','min="0"')+select('Sort','sort',['Best match','Highest rating','Lowest indicative rate','Nearest'])+
 '<label><input name="available" type="checkbox" checked>Available for new work</label><button class="primary">Find verified professionals</button><p class="cw-note">Compare rate units and scopes before deciding.</p></form><div><div class="cw-actions">'+btn('Compare selected','compare')+
 '<span id="cw-count" class="cw-note"></span></div><div id="cw-results" class="cw-results">'+empty('Choose filters to search verified professionals. No example profiles are shown.')+'</div></div></div>';
}
function cards(){
 document.querySelector('#cw-count').textContent=state.professionals.length+' matches · explainable ranking';
 document.querySelector('#cw-results').innerHTML=state.professionals.length?state.professionals.map((p,i)=>'<article class="cw-card"><div class="cw-card-top"><div class="cw-avatar">'+esc(p.name[0])+'</div><div><span class="cw-verified">✓ Verified professional</span><h3>'+esc(p.name)+'</h3><span class="cw-note">'+esc(p.company||p.profession)+'</span></div></div>'+
 '<div class="cw-chips"><span class="cw-chip">'+esc(p.profession)+'</span>'+(i===0?'<span class="cw-chip">Top result</span>':'')+'</div><div class="cw-metrics"><div><strong>'+(p.review_count?esc(p.rating)+' ★':'New')+'</strong><small>'+p.review_count+' reviews</small></div><div><strong>'+p.experience_years+' yrs</strong><small>Experience</small></div><div><strong>'+p.completed_projects+'</strong><small>Completed here</small></div></div>'+
 '<p class="cw-note">'+esc(p.city)+' · '+(p.distance_km===null?'Distance unavailable':p.distance_km+' km')+'<br>'+(p.available?'Available for work':'Not available')+'</p><h3>'+(p.rate===null?'Quote on request':money(p.rate)+' / '+esc(p.rate_unit))+'</h3><p class="cw-note">'+p.reasons.map(esc).join(' · ')+'</p>'+
 '<label><input type="checkbox" data-compare="'+esc(p.id)+'">Compare</label><div class="cw-actions">'+btn('View profile','professional',p.id)+btn('Request quote','request',p.id,true)+'</div></article>').join(''):empty('No verified professionals match. Try different filters. New profiles appear only after verification.');
}


async function renderWorkspace(){
 login();if(!state.me)await account();state.engagements=(await call('/engagements')).data;
 view.innerHTML='<div class="cw-actions"><h2>Quotes & construction</h2>'+btn('Refresh','inbox')+'</div><p>Requests, contracts and progress stay attached to the original project.</p><div class="cw-results">'+(state.engagements.length?state.engagements.map(r=>'<article class="cw-card"><span class="cw-chip">'+esc(r.data.stage)+'</span><h3>'+esc(r.data.project_name)+'</h3><p>'+esc(r.data.professional_name)+' · '+esc(r.data.profession)+'</p><p class="cw-note">'+esc(r.project_id)+' · '+esc(r.data.city)+'</p>'+(r.data.quote?'<h3>'+money(r.data.quote.total)+'</h3>':'<p>Awaiting quotation</p>')+btn('Open workspace','engagement',r.id,true)+'</article>').join(''):empty('No requests yet. Select a project and find your professional.'))+'</div>';
}
async function renderProfile(){
 await account();const p=state.me.profile||{};
 view.innerHTML='<div class="cw-grid"><section class="cw-panel"><div class="cw-eyebrow">For professionals</div><h2>Your professional profile</h2><p>Editing your profile sends it back for verification.</p><p class="cw-status">Status: '+esc(p.verification||'Not submitted')+'</p><form id="cw-profile-form"><div class="cw-fields">'+
 field('Name','name','text',p.name||'','required maxlength="100"')+field('Company (optional)','company','text',p.company||'','maxlength="150"')+select('Profession','profession',professions,p.profession)+
 field('Base city','city','text',p.city||'Coimbatore','required maxlength="100"')+field('Experience (years)','experience_years','number',p.experience_years??0,'min="0" max="80" required')+
 field('Service radius (km)','service_radius_km','number',p.service_radius_km||50,'min="1" max="500" required')+field('Indicative rate (₹, optional)','rate','number',p.rate??'','min="0"')+
 select('Rate unit','rate_unit',['project','day','sq ft','hour'],p.rate_unit||'project')+field('Latitude (optional)','lat','number',p.lat??'','min="-90" max="90" step="any"')+
 field('Longitude (optional)','lng','number',p.lng??'','min="-180" max="180" step="any"')+area('Services, experience and qualifications','bio',p.bio||'','required maxlength="2000"')+
 '<label><input name="available" type="checkbox" '+(p.available?'checked':'')+'>Available for work</label></div><div class="cw-actions"><button class="primary">Submit for verification</button></div></form></section>'+
 '<section class="cw-panel"><h2>From enquiry to handover</h2><p>Open incoming requests, discuss the scope, arrange a visit and send an itemized quotation. After customer acceptance, confirm the contract and await verified payment before starting work.</p><div class="cw-status">An authorized administrator reviews professional credentials. Do not enter identity numbers, bank details or private documents into your public profile.</div>'+btn('Open quote requests','inbox')+'</section></div>';
}
async function showEngagement(id){
 const r=state.engagements.find(x=>x.id===id);if(!r)throw Error('Refresh your requests first.');
 state.active=r;const x=r.data,customer=r.customer_id===state.me.user_id,pro=r.professional_id===state.me.user_id,actions=[];
 if(pro&&['requested','quoted'].includes(x.stage))actions.push(btn('Send quotation','quote',id,true));
 if(customer&&x.stage==='quoted')actions.push(btn('Accept quote & create contract','accept_quote',id,true));
 if(pro&&x.stage==='contract')actions.push(btn('Accept contract','sign_contract',id,true));
 if(customer&&x.stage==='payment')actions.push(btn('Pay agreed contract','pay',id,true));
 if(pro&&x.stage==='ready')actions.push(btn('Start construction','start',id,true));
 if(pro&&x.stage==='construction')actions.push(btn('Request handover','request_completion',id));
 if(customer&&x.stage==='handover')actions.push(btn('Accept handover','complete',id,true));
 if(customer&&x.stage==='completed'&&!x.review)actions.push(btn('Leave a review','review',id,true));
 const progress=x.tasks?Math.round(x.tasks.reduce((s,t)=>s+t.progress,0)/x.tasks.length):0;
 view.innerHTML='<div class="cw-actions">'+btn('← All requests','inbox')+'<span class="cw-chip">'+esc(x.stage)+'</span></div><h2>'+esc(x.project_name)+'</h2><p>'+esc(r.project_id)+' · '+esc(x.professional_name)+' · '+esc(x.profession)+'</p>'+
 '<div class="cw-summary"><div>Agreed quote<strong>'+(x.quote?money(x.quote.total):'Pending')+'</strong></div><div>Construction<strong>'+progress+'%</strong></div><div>Payment<strong>'+esc(x.payment?.status||'Not started')+'</strong></div><div>Actual task cost<strong>'+money((x.tasks||[]).reduce((s,t)=>s+t.cost,0))+'</strong></div></div>'+
 '<div class="cw-grid"><section class="cw-panel"><h3>Scope & agreement</h3><p>'+esc(x.scope)+'</p><details><summary>Project requirements</summary><p>'+esc(JSON.stringify(x.requirements))+'</p></details>'+
 (x.quote?'<div class="cw-scroll"><table><tr><th>Item</th><th>Qty</th><th>Rate</th></tr>'+x.quote.items.map(i=>'<tr><td>'+esc(i.description)+'</td><td>'+i.quantity+'</td><td>'+money(i.rate)+'</td></tr>').join('')+'</table></div><p>Tax '+x.quote.tax_percent+'% · Total '+money(x.quote.total)+'</p><p class="cw-note">Valid until '+esc(x.quote.valid_until)+' · Starts '+esc(x.quote.start_date)+' · '+x.quote.duration_days+' days</p><p>'+esc(x.quote.terms)+'</p>':'<p>Awaiting an itemized quotation.</p>')+
 (x.contract?'<p class="cw-verified">Customer accepted · Professional '+(x.contract.professional_accepted_at?'accepted':'acceptance pending')+'</p>':'')+
 '<div class="cw-actions">'+actions.join('')+'</div>'+
 (x.stage==='payment'?'<p class="cw-note">This release collects the full contract amount. Payment remains pending until the gateway webhook is verified. Refresh after payment.</p>':'')+
 (x.review?'<div class="cw-status">'+x.review.rating+' ★ · '+esc(x.review.text)+'</div>':'')+
 '<details open><summary>Site visit</summary>'+(x.visit?'<p>'+esc(x.visit.date)+' · '+esc(x.visit.time)+' · '+(x.visit.confirmed?'Confirmed':'Awaiting confirmation')+'</p><p>'+esc(x.visit.note)+'</p>':'<p>Agree a date and scope before visiting.</p>')+
 '<div class="cw-actions">'+(['requested','quoted'].includes(x.stage)?btn('Propose site visit','visit',id):'')+(x.visit&&!x.visit.confirmed&&x.visit.proposed_by!==state.me.user_id?btn('Confirm visit','confirm_visit',id):'')+'</div></details></section>'+
 '<section class="cw-panel"><h3>Project conversation</h3><p class="cw-note">Private to this customer and professional.</p>'+(x.messages||[]).map(m=>'<div class="cw-message"><small>'+(m.author===state.me.user_id?'You':'Other participant')+' · '+esc(m.at.slice(0,16))+'</small><br>'+esc(m.text)+'</div>').join('')+
 '<form id="cw-message-form">'+area('Message','text','','required maxlength="2000"')+'<div class="cw-actions"><button class="primary">Send message</button>'+btn('Refresh','refresh-engagement',id)+'</div></form></section></div>'+
 '<section class="cw-panel" style="margin-top:20px"><div class="cw-eyebrow">Execution workspace · Engine 12</div><h2>Progress, quality & materials</h2>'+
 (x.tasks?x.tasks.map(t=>'<div class="cw-task"><div><strong>'+esc(t.name)+'</strong><p class="cw-note">'+esc(t.materials||'No materials recorded')+' · '+money(t.cost)+' · '+esc(t.quality.replaceAll('_',' '))+'</p></div><div>'+t.progress+'%<progress max="100" value="'+t.progress+'"></progress></div><div>'+(pro&&x.stage==='construction'?btn('Update task','task',t.id):'')+(customer&&x.stage==='construction'&&t.progress===100&&t.quality==='pending'?btn('Accept quality','quality',t.id):'')+'</div></div>').join(''):empty('The construction schedule opens after contract acceptance and verified payment.'))+
 '<p class="cw-note">Customer quality acceptance does not replace a qualified engineer’s inspection.</p></section>'+
 '<section class="cw-panel" style="margin-top:20px"><div class="cw-eyebrow">Project state & history · Engine 11</div><h2>Keep everyone on the same plan</h2>'+
 (x.stage==='construction'&&!x.variation?btn('Propose scope change','variation',id):'')+
 (x.variation?'<div class="cw-status">'+esc(x.variation.description)+' · '+money(x.variation.cost)+' · '+x.variation.days+' extra days</div><div class="cw-actions">'+(!x.variation.approvals.includes(state.me.user_id)?btn('Approve change','approve_variation',id):'')+btn('Reject change','reject_variation',id)+'</div>':'')+
 (x.approved_variations||[]).map(v=>'<p>Approved: '+esc(v.description)+' · '+money(v.cost)+' · '+v.days+' days</p>').join('')+
 (x.design_review_required?'<div class="cw-status">Scope changes require professional review of design, BOQ, materials and schedule. Automated cross-engine updates are not connected.</div>':'')+
 '<div class="cw-actions">'+btn('Load event history','events',id)+'</div><div id="cw-events"></div></section>';
}
async function action(a,input={}){
 const r=state.active;await call('/engagements/'+r.id+'/actions','POST',{version:r.version,action:a,input});
 state.engagements=(await call('/engagements')).data;await showEngagement(r.id);notice('Saved. The other participant has an in-app update.');
}
async function tab(name){
 notice('');view.innerHTML=empty('Loading workspace…');root.querySelectorAll('.cw-tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));
 try{
 if(name==='project'){if(localStorage.getItem('ohisee_jwt'))try{await projects();}catch(e){notice(e.message);}renderProject();}
 if(name==='professionals')renderProfessionals();
 if(name==='workspace')await renderWorkspace();
 if(name==='profile')await renderProfile();
 if(name==='leads'){await account();const leads=(await call('/home-leads')).data;view.innerHTML='<h2>New home requests</h2><p>Requests shared by clients in your city. Accept to discuss the scope; client approval is required before work starts.</p>'+ (leads.length?leads.map(p=>'<article class="cw-card"><h3>'+esc(p.projectName)+'</h3><p>'+esc(p.city)+' · '+esc(p.requirements?.building.bedrooms)+' bedrooms · '+esc(p.requirements?.plot.areaSqFt)+' sq.ft plot</p><details><summary>View requirements</summary><pre style="white-space:pre-wrap;max-height:420px;overflow:auto">'+esc(JSON.stringify(p.requirements,null,2))+'</pre></details>'+btn('Accept & discuss with client','accept-lead',p.projectId,true)+'</article>').join(''):empty('No shared home requests in your city yet.'));}

 if(name==='notifications'){login();const rows=(await call('/notifications')).data;view.innerHTML='<h2>Your updates</h2>'+(rows.length?rows.map(n=>'<div class="cw-card"><p>'+esc(n.message)+'</p><p class="cw-note">'+esc(n.created_at)+'</p>'+(!n.read_at?btn('Mark read','read',n.id):'<span class="cw-note">Read</span>')+'</div>').join(''):empty('No updates yet.'));}
 if(name==='verification'){await account();const rows=(await call('/verification')).data;view.innerHTML='<h2>Professional verification</h2><p>Review credentials privately before approval. Use a case reference, never identity numbers.</p><div class="cw-results">'+rows.map(p=>'<div class="cw-card"><h3>'+esc(p.name)+'</h3><p>'+esc(p.profession)+' · '+esc(p.city)+' · '+esc(p.verification)+'</p><p>'+esc(p.bio)+'</p>'+btn('Review status','verify',p.id)+'</div>').join('')+'</div>';}
 }catch(e){view.innerHTML=empty(e.message)+(name==='leads'?'<button type="button" data-tab="profile">Complete provider profile</button>':'');notice(e.message);}
}


root.addEventListener('change',e=>{
 if(e.target.id==='cw-picker'){state.selected=state.projects.find(p=>p.project_id===e.target.value)||null;renderProject();}
 if(e.target.dataset.compare){const id=e.target.dataset.compare;if(e.target.checked&&state.compare.size>=3){e.target.checked=false;notice('Compare up to three professionals.');return;}e.target.checked?state.compare.add(id):state.compare.delete(id);}
});
root.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.target,b=Object.fromEntries(new FormData(form)),submit=e.submitter;submit.disabled=true;notice('');
 try{
 if(form.id==='cw-project-form'){
 login();if((b.lat==='')!==(b.lng===''))throw Error('Provide both coordinates or neither.');
 const payload={project_name:b.project_name,project_type:'Residential',city:b.city,location:b.city,state:'Tamil Nadu',plot_size:b.plot_size,built_up_area:b.built_up_area,description:b.description,budget:Number(b.budget),floors:Number(b.floors),bedrooms:Number(b.bedrooms),bathrooms:Number(b.bathrooms),quality_level:b.quality_level,construction_context:{start_date:b.start_date,duration_months:Number(b.duration_months),parking:b.parking==='on',...(b.lat!==''?{lat:Number(b.lat),lng:Number(b.lng)}:{})}};
 state.selected=(await api('/projects'+(state.selected?'/'+encodeURIComponent(state.selected.project_id):''),state.selected?'PUT':'POST',payload)).data;
 await projects();renderProject();notice('Project saved. Generate a preliminary BOQ or find your team.');
 }
 if(form.id==='cw-search-form'){
 const q=new URLSearchParams({...b,available:String(b.available==='on'),sort:({'Highest rating':'rating','Lowest indicative rate':'price','Nearest':'distance'})[b.sort]||'match'});
 if(state.selected?.construction_context?.lat!=null){q.set('lat',state.selected.construction_context.lat);q.set('lng',state.selected.construction_context.lng);}
 state.professionals=(await call('/professionals?'+q)).data;state.compare.clear();cards();
 }
 if(form.id==='cw-profile-form'){await call('/profile','PUT',{...b,available:b.available==='on'});await renderProfile();notice('Profile submitted for verification.');}
 if(form.id==='cw-message-form')await action('message',{text:b.text});
 }catch(err){notice(err.message);}finally{submit.disabled=false;}
});
root.addEventListener('click',async e=>{
 const t=e.target.closest('button');if(!t)return;if(t.dataset.tab){await tab(t.dataset.tab);return;}
 const a=t.dataset.action,id=t.dataset.id;if(!a)return;t.disabled=true;notice('');
 try{
 if(a==='accept-lead'){const result=await call('/home-leads/'+encodeURIComponent(id)+'/accept','POST',{});state.engagements=(await call('/engagements')).data;await showEngagement(result.engagementId);notice('Request accepted for discussion. Use the private project conversation to contact the client.');}
 else if(a==='new-project'){state.selected=null;renderProject();}
 else if(a==='find-team'){if(!state.selected)throw Error('Create or select a project first.');await tab('professionals');}
 else if(a==='boq'){login();if(!state.selected)throw Error('Create or select a project first.');notice('Generating preliminary BOQ…');const data=await api('/ai/boq','POST',{projectId:state.selected.project_id});state.selected.boq_data=data.boq;document.querySelector('#cw-boq').innerHTML=boqHtml(data.boq);notice('BOQ generated. Professional review required.');}
 else if(a==='professional'){const p=state.professionals.find(x=>x.id===id);modal(p.name,'<div class="cw-wide"><p>'+esc(p.bio)+'</p><p>'+esc(p.profession)+' · '+esc(p.city)+'</p><h3>Completed-project reviews</h3>'+(p.reviews.length?p.reviews.map(r=>'<p>'+r.rating+' ★ · '+esc(r.text)+'</p>').join(''):'<p>No reviews yet.</p>')+'</div>');}
 else if(a==='compare'){
 const ps=state.professionals.filter(p=>state.compare.has(p.id));if(ps.length<2)throw Error('Select two or three professionals.');
 modal('Compare professionals','<div class="cw-wide cw-scroll"><table><tr><th>Criteria</th>'+ps.map(p=>'<th>'+esc(p.name)+'</th>').join('')+'</tr>'+[['Profession',p=>p.profession],['Experience',p=>p.experience_years+' years'],['Rating',p=>p.review_count?p.rating+' / 5':'No reviews'],['Completed here',p=>p.completed_projects],['Distance',p=>p.distance_km===null?'Unavailable':p.distance_km+' km'],['Indicative rate',p=>p.rate===null?'Request quote':money(p.rate)+' / '+p.rate_unit],['Availability',p=>p.available?'Available':'Unavailable']].map(([label,fn])=>'<tr><th>'+label+'</th>'+ps.map(p=>'<td>'+esc(fn(p))+'</td>').join('')+'</tr>').join('')+'</table></div>');
 }
 else if(a==='request'){
 login();if(!state.selected)throw Error('Create or select a construction project in Your project first.');
 const p=state.professionals.find(x=>x.id===id);
 modal('Contact '+p.name,select('Request type','kind',['Quote','Contact','Site visit'])+area('Work you need','scope',state.selected.description,'required maxlength="4000"'),async b=>{await call('/requests','POST',{project_id:state.selected.project_id,professional_id:id,kind:({'Quote':'quote','Contact':'contact','Site visit':'site_visit'})[b.kind],scope:b.scope});await tab('workspace');notice('Request saved. The professional has an in-app notification.');});
 }
 else if(a==='inbox')await tab('workspace');
 else if(a==='engagement')await showEngagement(id);
 else if(a==='refresh-engagement'){state.engagements=(await call('/engagements')).data;await showEngagement(id);}
 else if(a==='quote')modal('Send itemized quotation',area('One item per line: Description | Quantity | Rate','items','Labour | 1 | 0\nMaterials | 1 | 0\nTransport | 1 | 0','required')+field('Tax (%)','tax_percent','number',0,'min="0" max="30" step=".01" required')+field('Valid until','valid_until','date','','required')+field('Start date','start_date','date','','required')+field('Duration (days)','duration_days','number',30,'min="1" max="3650" required')+area('Scope, exclusions, warranty and payment terms','terms','','required maxlength="4000"'),async b=>{const items=b.items.split('\n').filter(x=>x.trim()).map(line=>{const p=line.split('|');if(p.length!==3)throw Error('Each line needs Description | Quantity | Rate.');return {description:p[0].trim(),quantity:p[1].trim(),rate:p[2].trim()};});await action('quote',{...b,items});});
 else if(a==='visit')modal('Propose site visit',field('Date','date','date','','required')+field('Time','time','time','','required')+area('Visit scope and any fee to agree','note','','required maxlength="500"'),b=>action('site_visit',b));
 else if(a==='task'){const task=state.active.data.tasks.find(x=>x.id===Number(id));modal('Update '+task.name,field('Progress (%)','progress','number',task.progress,'min="0" max="100" required')+field('Actual cost (₹)','cost','number',task.cost,'min="0" required')+area('Materials used and notes','materials',task.materials,'maxlength="2000"'),b=>action('task',{...b,id:Number(id)}));}
 else if(a==='quality')await action('quality',{id:Number(id)});
 else if(a==='variation')modal('Propose scope change',area('Change and affected work','description','','required')+field('Additional cost (₹)','cost','number',0,'min="0" required')+field('Additional days','days','number',0,'min="0" max="365" required'),b=>action('variation',b));
 else if(a==='review')modal('Review completed work',select('Rating','rating',['5','4','3','2','1'])+area('Your experience','text','','required maxlength="2000"'),b=>action('review',b));
 else if(a==='events'){const rows=(await call('/engagements/'+id+'/events')).data;document.querySelector('#cw-events').innerHTML='<div class="cw-timeline">'+rows.map(x=>'<div>'+esc(x.action.replaceAll('_',' '))+'<br><small>'+esc(x.created_at)+'</small></div>').join('')+'</div>';}
 else if(a==='pay'){
 const order=await call('/engagements/'+id+'/payment-order','POST',{});
 if(!window.Razorpay)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.onload=resolve;script.onerror=()=>reject(Error('Payment checkout could not load.'));document.head.append(script);});
 new window.Razorpay({key:order.key,order_id:order.order_id,amount:order.amount,currency:order.currency,name:'OH I SEE',description:'Construction contract',handler:()=>notice('Payment submitted. Awaiting server verification; refresh shortly.'),theme:{color:'#ffe000'}}).open();
 }
 else if(a==='read'){await call('/notifications/'+id,'PATCH',{});await tab('notifications');}
 else if(a==='verify')modal('Review verification',select('Decision','status',['verified','rejected','suspended'])+field('Private review case reference','reference','text','','required maxlength="250"'),async b=>{await call('/verification/'+id,'POST',b);await tab('verification');});
 else if(['accept_quote','sign_contract','start','request_completion','complete','confirm_visit','approve_variation','reject_variation'].includes(a))modal('Confirm '+a.replaceAll('_',' '),'<p class="cw-wide">This records your agreement in the project history. Review the scope and amounts in the workspace before continuing.</p>',()=>action(a));
 }catch(err){notice(err.message);}finally{t.disabled=false;}
});
tab(['workspace','profile','leads'].includes(location.hash.slice(1))?location.hash.slice(1):'project');
if(localStorage.getItem('ohisee_jwt'))account().catch(()=>{});


document.addEventListener('click',async e=>{const link=e.target.closest('a[data-profession],a[data-workflow]');if(!link)return;e.preventDefault();await tab(link.dataset.profession?'professionals':'project');if(link.dataset.profession)view.querySelector('[name=profession]').value=link.dataset.profession;root.scrollIntoView({behavior:'smooth'});});
