// Registered builders, private client leads and supplier-based proposals.
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v==null?'Not set':'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
const label=v=>String(v||'').replace(/_/g,' ');
async function api(path,body,method){
 const base=typeof resolveOhiseeApiBase==='function'?resolveOhiseeApiBase():'/api';
 const token=typeof TokenStore!=='undefined'?TokenStore.get():localStorage.getItem('ohisee_jwt');
 const r=await fetch(base+'/marketplace'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await r.json();if(!r.ok)throw new Error(result.error||'Request failed.');return result;
}
function error(el,e){let box=el.querySelector('[data-mp-error]');if(!box){box=document.createElement('div');box.dataset.mpError='';el.prepend(box);}box.className='mp-error';box.setAttribute('role','alert');box.textContent=e.message;}
function bind(el,selector,fn){el.querySelectorAll(selector).forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await fn(button);}catch(e){error(el,e);}finally{button.disabled=false;}}));}
function field(name,title,value='',type='text',extra=''){return `<label>${esc(title)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function formData(form){return Object.fromEntries(new FormData(form));}
function stats(facts){return `<div class="mp-grid mp-card"><div>Built-up area<br><strong>${esc(facts.area)} sq.ft</strong></div><div>Your budget<br><strong>${facts.budget?money(facts.budget):'Not set'}</strong></div><div>Project estimate<br><strong>${facts.estimate?money(facts.estimate):'Not generated yet'}</strong></div><div>Project city<br><strong>${esc(facts.city)}</strong></div></div>`;}

function builderCards(data){
 return '<div class="mp-builders">'+(data.builders||[]).map(b=>{
 const q=data.quotes.find(q=>q.contractor_id===b.contractor_id);
 const photo=['https://','http://','data:image/png;base64,','data:image/jpeg;base64,','data:image/webp;base64,'].some(prefix=>(b.profile_image||'').startsWith(prefix))?b.profile_image:'';
 const avatar=photo?'<img src="'+esc(photo)+'" alt="'+esc(b.company)+' profile photo" loading="lazy">':esc(b.company.slice(0,2).toUpperCase());
 const request=(data.requests||[]).find(j=>j.contractor_id===b.contractor_id);
 const action=!request&&b.available?'<button data-select="'+esc(b.contractor_id)+'">Send request</button>':request?'<span class="mp-badge">'+(request.data.accepted_at?'Request approved':'Request sent · Awaiting approval')+'</span><button class="secondary" data-open-job="'+esc(request.id)+'">View request</button>':!b.available?'Unavailable for new work':'Another builder request is active';
 return '<article class="mp-card mp-builder"><header><div class="mp-avatar">'+avatar+'</div><div><h2>'+esc(b.company)+'</h2><p>'+esc(b.city)+' · Registered contractor</p></div></header><p>'+esc(b.scope)+'</p><div class="mp-builder-facts"><div><small>Price per sq.ft</small><strong>'+(b.pricing_ready?money(b.rate_min)+'–'+money(b.rate_max):'Not published yet')+'</strong></div><div><small>Estimated project cost</small><strong>'+(q?money(q.estimate_min)+'–'+money(q.estimate_max):'Request an estimate')+'</strong></div></div>'+(q?'<p class="mp-badge">'+esc(q.budget_fit)+'</p>':'')+'<footer>'+action+'</footer></article>';
 }).join('')+'</div>';
}
function contactHTML(j){
 if(!j.contact)return '';
 return '<div class="mp-card"><h3>Request approved — contact your contractor</h3><p>Email: '+(j.contact.email?'<a href="mailto:'+esc(j.contact.email)+'">'+esc(j.contact.email)+'</a>':'Not provided')+'</p><p>Phone: '+(j.contact.phone?'<a href="tel:'+esc(j.contact.phone.replace(/[^+0-9]/g,''))+'">'+esc(j.contact.phone)+'</a>':'Not provided')+'</p></div>';
}

async function renderComparison(el,projectId){
 el.classList.add('mp');el.innerHTML='<p>Loading registered builders…</p>';
 try{
  if(!projectId){
   el.innerHTML='<h1>Compare registered builders</h1><p>Choose a saved project to compare builders against its area, estimate and budget.</p><a class="mp-btn" href="customer-portal.html?view=projects">Choose project</a>';return;
  }
  const {data}=await api('/projects/'+encodeURIComponent(projectId)+'/comparison');
  el.innerHTML=`<h1>Compare registered builders</h1><p>${esc(data.project.project_name)} · ${esc(projectId)}</p>${stats(data.facts)}
  <p class="mp-muted">Published ranges × built-up area are preliminary estimates. Listed in budget-fit order, then by maximum estimate. Review included scope before choosing; the lowest range does not establish construction quality.</p>
  ${builderCards(data)}<div data-job-panel></div>`;
  bind(el,'[data-select]',async b=>{await api('/projects/'+encodeURIComponent(projectId)+'/request',{contractor_id:b.dataset.select});await renderComparison(el,projectId);});
  bind(el,'[data-open-job]',b=>renderJob(el.querySelector('[data-job-panel]'),b.dataset.openJob));
  if(data.requests?.length===1)await renderJob(el.querySelector('[data-job-panel]'),data.requests[0].id);
 }catch(e){el.innerHTML='<h1>Builder comparison</h1>';error(el,e);}
}
async function renderProfile(el,me,after){
 const p=me.profile||{},u=me.user,contractor=u.kind==='contractor';
 el.innerHTML=`<div class="mp-card"><h2>${contractor?'Contractor price range':'Supplier company profile'}</h2><p>${p.user_id?'Keep your published details current.':'Complete this profile to appear in project matching.'}</p><form data-profile><div class="mp-grid">${field('company','Company',p.company||u.company,'text','required maxlength="150"')}${field('city','Service city',p.city||u.city,'text','required maxlength="100"')}${contractor?field('rate_min','Minimum ₹ / sq.ft',p.rate_min,'number','required min="1" step="0.01"')+field('rate_max','Maximum ₹ / sq.ft',p.rate_max,'number','required min="1" step="0.01"'):''}</div><label>${contractor?'Included scope, materials and exclusions':'Supplied categories and service details'}<textarea name="scope" required maxlength="2000">${esc(p.scope||'')}</textarea></label><label><input name="available" type="checkbox" ${p.available!==false?'checked':''}>Available for new work / supply</label><button>Save profile</button></form></div>`;
 el.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const values=formData(e.target);values.available=e.target.elements.available.checked;await api('/profile',values,'PUT');await after();}catch(err){error(el,err);}finally{b.disabled=false;}});
}
async function renderContractor(el,{acceptedOnly=false,profile=true}={}){
 el.classList.add('mp');el.innerHTML='<p>Loading your client leads…</p>';
 try{
  const me=await api('/me');if(me.user.kind!=='contractor')throw new Error('Sign in with a contractor account.');
  const {data:jobs}=await api('/jobs');
  const saved=acceptedOnly?{data:[]}:await api('/saved-projects');
  const visible=acceptedOnly?jobs.filter(j=>j.data.stage!=='requested'):jobs;
  el.innerHTML=`${!acceptedOnly?`<section data-saved-projects><div class="mp-row"><h2>Client Leads · ${esc(saved.city||'Your service city')}</h2><button class="secondary" data-refresh>Refresh projects</button></div><p>Saved project summaries appear here before builder selection. Open View details to read customer inputs. Clients select a builder to start a private conversation.</p>${saved.data.length?saved.data.map(p=>`<article class="mp-card"><h3>${esc(p.project_name||'Untitled project')}</h3><p>${esc(p.project_id)} · ${esc(p.project_type||'Construction project')} · ${esc(label(p.status))}</p><div class="mp-grid"><p>City: ${esc(p.city)}<br>Built-up area: ${p.area?esc(p.area)+' sq.ft':'Not set'}</p><p>Client budget: ${p.budget?money(p.budget):'Not set'}<br>Project estimate: ${p.estimate?money(p.estimate):'Not generated yet'}</p></div><span class="mp-badge">Awaiting client builder selection</span><p><button data-view-saved="${esc(p.project_id)}" aria-label="View details for ${esc(p.project_id)}"><span aria-hidden="true">👁</span> View details</button></p></article>`).join(''):'<div class="mp-card">No projects have been saved to the server for your service city yet. On the customer account, open the project and click Save as Draft. After the account-save confirmation, refresh this list.</div>'}</section>`:''}<div class="mp-row"><h2>${acceptedOnly?'Accepted projects':'Client leads & new messages'}</h2><button class="secondary" data-refresh>Refresh</button></div>${!me.profile?'<p class="mp-badge">Publish your ₹/sq.ft range before customers can select you.</p>':''}<div data-lead-list>${visible.length?visible.map(j=>`<article class="mp-card"><h3>${esc(j.data.project.project_name)}</h3><p data-job-status="${esc(j.id)}">${esc(j.project_id)} · ${esc(label(j.data.stage))} ${j.data.unread_for===me.user.id?'<span class="mp-badge">New message received</span>':''}</p><p>Customer budget: ${money(j.data.project.budget)} · Published estimate: ${money(j.data.estimate.estimate_min)}–${money(j.data.estimate.estimate_max)}</p><button data-open-job="${esc(j.id)}">Review client requirements</button></article>`).join(''):'<div class="mp-card">No client leads yet. A lead appears here when a customer selects your registered company.</div>'}</div><div data-job-panel></div>${profile?'<details class="mp-card"><summary>Contractor pricing & availability</summary><div data-profile-panel></div></details>':''}`;
  if(profile)await renderProfile(el.querySelector('[data-profile-panel]'),me,()=>renderContractor(el,{acceptedOnly,profile}));
  bind(el,'[data-refresh]',()=>renderContractor(el,{acceptedOnly,profile}));
  bind(el,'[data-open-job]',b=>renderJob(el.querySelector('[data-job-panel]'),b.dataset.openJob));
  bind(el,'[data-view-saved]',b=>viewSavedProject(b.dataset.viewSaved));
  const count=document.getElementById('leads-count-badge');if(count)count.textContent=jobs.filter(j=>j.data.unread_for===me.user.id).length;
  const stat=document.getElementById('stat-leads');if(stat)stat.textContent=jobs.filter(j=>j.data.stage==='requested').length;
 }catch(e){el.innerHTML='<h2>Client leads</h2>';error(el,e);}
}
function proposalHTML(p){return `<h3>Itemized contractor proposal</h3>${p.grade?`<p>Agreed grade: ${esc(p.grade)}<br>${esc(p.specification)}</p>`:''}<div class="mp-scroll"><table><thead><tr><th>Material / supplier</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${p.items.map(i=>`<tr><td>${esc(i.category)}: ${esc(i.name)} (${esc(i.brand)})<br><small>${esc(i.company)}</small></td><td>${i.quantity} ${esc(i.unit)}</td><td>${money(i.rate)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table></div><div class="mp-grid mp-card"><p>Materials: ${money(p.materials)}<br>Labour: ${money(p.labour)}<br>Other: ${money(p.other)}</p><p>Tax (${p.tax_percent}%): ${money(p.tax)}<br>Contingency (${p.contingency_percent}%): ${money(p.contingency)}</p><p class="mp-price">Total: ${money(p.total)}</p><p>Client budget: ${p.budget?money(p.budget):'Not set'}<br>${p.budget?(p.variance>0?money(p.variance)+' over budget':money(-p.variance)+' remaining'):'Set a budget to compare'}<br>Duration: ${p.duration_days} days</p></div><p>Scope / exclusions: ${esc(p.exclusions)}</p><p class="mp-muted">Categories not itemized: ${esc(p.uncovered.join(', ')||'None')}. Confirm whether these are excluded or included in other costs. Supplier stock is a current listing, not a reservation.</p>`;}
function detailFields(value){
 const hidden=new Set(['storage_path','uploaded_by','requirements_hash','token','data','url']);
 if(value===null||value===undefined||value==='')return '';
 if(typeof value!=='object')return esc(typeof value==='boolean'?(value?'Yes':'No'):value);
 return '<dl class="mp-detail-grid">'+Object.entries(value).filter(([k,v])=>!hidden.has(k)&&v!==null&&v!==undefined&&v!=='').map(([k,v])=>'<div><dt>'+esc(label(k.replace(/([a-z])([A-Z])/g,'$1 $2')))+' </dt><dd>'+detailFields(v)+'</dd></div>').join('')+'</dl>';
}
function requirementsHTML(project){
 const {construction_context={},...fields}=project;
 const allowed=['project_id','project_name','project_type','client_name','description','intent_type','status','city','state','district','location','pincode','latitude','longitude','survey_number','plot_size','plot_length','plot_width','road_facing','facing_direction','built_up_area','floors','bedrooms','bathrooms','parking_count','has_pooja','has_office','has_terrace','vastu_preference','architectural_style','quality_level','budget','estimated_cost','start_date','target_completion_date','last_saved_at'];
 const sections={projectSetup:'Project setup',landSite:'Land & site',projectRequirements:'Rooms, parking & lifestyle requirements',intentAnswers:'Additional customer requirements'};
 return '<h3>Project details</h3>'+detailFields(Object.fromEntries(Object.entries(fields).filter(([k])=>allowed.includes(k))))+Object.entries(sections).filter(([k])=>construction_context[k]).map(([k,title])=>'<section><h3>'+title+'</h3>'+detailFields(construction_context[k])+'</section>').join('');
}
async function viewSavedProject(id){
 const {data:p}=await api('/saved-projects/'+encodeURIComponent(id));
 const modal=document.createElement('dialog');modal.className='mp mp-project-dialog';
 modal.innerHTML='<div class="mp-row"><h2>'+esc(p.project_name||'Client project')+'</h2><button data-close aria-label="Close project details">Close ✕</button></div><p><strong>Project ID: '+esc(p.project_id)+'</strong></p>'+requirementsHTML(p);
 document.body.appendChild(modal);
 modal.querySelector('[data-close]').addEventListener('click',()=>modal.close());
 modal.addEventListener('close',()=>modal.remove());modal.showModal();
}
async function renderJob(el,id){
 el.classList.add('mp');el.innerHTML='<p>Loading project lead…</p>';
 try{
  const me=await api('/me');let {data:j}=await api('/jobs/'+encodeURIComponent(id));
  if(j.data.unread_for===me.user.id)({data:j}=await api('/jobs/'+id+'/actions',{version:j.version,action:'read'}));
  const contractor=j.contractor_id===me.user.id,p=j.data.project;
  document.querySelectorAll('[data-job-status]').forEach(node=>{if(node.dataset.jobStatus===j.id)node.textContent=j.project_id+' · '+label(j.data.stage)+(j.data.unread_for===me.user.id?' · New message received':'');});
  el.innerHTML=`<div class="mp-card"><h2>${esc(p.project_name)} · ${esc(label(j.data.stage))}</h2><p>Builder: ${esc(j.data.builder_name)}</p>${contactHTML(j)}<details><summary>Client project requirements</summary><p>Plot: ${esc(p.plot_size||'See land details')} · Built-up area: ${esc(p.built_up_area)} · Budget: ${money(p.budget)}</p>${requirementsHTML(p)}</details>${contractor&&j.data.stage==='requested'?'<button data-action="accept">Accept request & share contact details</button>':''}${j.data.proposal?proposalHTML(j.data.proposal):'<p>Awaiting the contractor’s itemized proposal.</p>'}
  ${!contractor&&j.data.stage==='proposal_sent'?'<div class="mp-row"><button data-action="approve">Approve this budget</button><button class="secondary" data-revise>Request changes</button></div><label>Requested changes<textarea data-revision></textarea></label>':''}
  ${contractor&&j.data.stage==='approved'?'<button data-action="start">Start approved project</button>':''}
  ${contractor&&['estimating','proposal_sent','revision_requested'].includes(j.data.stage)?'<div data-estimator></div>':''}
  ${['estimating','proposal_sent','revision_requested','approved','in_execution'].includes(j.data.stage)?'<div data-roadmap></div>':''}<h3 style="margin-top:24px">Private messages</h3>${j.data.messages.map(msg=>`<div class="mp-message"><strong>${msg.author===me.user.id?'You':msg.author===j.contractor_id?'Contractor':'Client'}</strong><small> · ${esc(new Date(msg.at).toLocaleString())}</small><div>${esc(msg.text)}</div></div>`).join('')}<form data-message><label>Message<textarea name="text" maxlength="2000" required></textarea></label><button>Send message</button></form><p><button class="secondary" data-refresh-job>Refresh updates</button></p></div>`;
  const action=async(action,extra={})=>{await api('/jobs/'+id+'/actions',{version:j.version,action,...extra});await renderJob(el,id);};
  bind(el,'[data-action]',b=>action(b.dataset.action,b.dataset.action==='approve'?{confirm_total:j.data.proposal.total}:{}));
  bind(el,'[data-revise]',()=>action('revise',{text:el.querySelector('[data-revision]').value}));
  bind(el,'[data-refresh-job]',()=>renderJob(el,id));
  el.querySelector('[data-message]').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await action('message',{text:e.target.elements.text.value});}catch(err){error(el,err);b.disabled=false;}});
  if(el.querySelector('[data-roadmap]'))await RoadmapUI.render(el.querySelector('[data-roadmap]'),j,contractor,action);
  if(el.querySelector('[data-estimator]'))await renderEstimator(el.querySelector('[data-estimator]'),j,action);
 }catch(e){error(el,e);}
}
async function renderEstimator(el,job,action){
 const {data:suppliers}=await api('/suppliers');
 const selected=new Map(),previous=job.data.proposal;
 el.innerHTML=`<div class="mp-card"><h3>Build supplier material budget</h3><p>Select a registered supplier to view its products. Add quantities for cement, bricks, steel, plumbing, electrical and the remaining material categories.</p><div class="mp-grid">${suppliers.map(s=>`<button class="secondary" data-supplier="${esc(s.user_id)}">${esc(s.company)}<br><small>${esc(s.city)} · ${esc(s.scope)}</small></button>`).join('')||'<p>No registered supplier companies yet.</p>'}</div><div data-products></div><h3 style="margin-top:20px">Material quantities</h3><div data-cart></div><form data-proposal><div class="mp-grid">${field('labour','Labour cost ₹',previous?.labour||0,'number','min="0" step="0.01" required')}${field('other','Other cost ₹',previous?.other||0,'number','min="0" step="0.01" required')}${field('tax_percent','Tax %',previous?.tax_percent||0,'number','min="0" max="30" step="0.01" required')}${field('contingency_percent','Contingency %',previous?.contingency_percent||0,'number','min="0" max="30" step="0.01" required')}${field('duration_days','Duration (days)',previous?.duration_days||180,'number','min="1" max="3650" required')}</div><label>Included work, excluded categories and other cost details<textarea name="exclusions" required maxlength="4000">${esc(previous?.exclusions||'')}</textarea></label><p data-preview class="mp-price"></p><button>Send itemized budget to client</button></form></div>`;
 const form=el.querySelector('form');
 function preview(){const v=formData(form),materials=[...selected.values()].reduce((n,p)=>n+p.quantity*p.price,0),subtotal=materials+Number(v.labour||0)+Number(v.other||0),total=Math.round(subtotal*(1+(Number(v.tax_percent||0)+Number(v.contingency_percent||0))/100)*100)/100,budget=Number(job.data.project.budget||0);el.querySelector('[data-preview]').textContent='Preview: '+money(total)+(budget?' · '+(total>budget?money(total-budget)+' over budget':money(budget-total)+' remaining'):'');}
 function cart(){el.querySelector('[data-cart]').innerHTML=[...selected.values()].map(p=>`<div class="mp-row"><span>${esc(p.name)} · ${esc(p.company)} · ${money(p.price)}/${esc(p.unit)}</span><label>Quantity<input type="number" data-quantity="${esc(p.id)}" value="${p.quantity}" min="0.01" max="${p.stock}" step="0.01"></label><button class="secondary" data-remove="${esc(p.id)}">Remove</button></div>`).join('')||'<p>No materials added.</p>';el.querySelectorAll('[data-quantity]').forEach(i=>i.addEventListener('input',()=>{selected.get(i.dataset.quantity).quantity=Number(i.value);preview();}));bind(el,'[data-remove]',b=>{selected.delete(b.dataset.remove);cart();});preview();}
 bind(el,'[data-supplier]',async b=>{
  const supplier=suppliers.find(s=>s.user_id===b.dataset.supplier),{data:products}=await api('/suppliers/'+encodeURIComponent(supplier.user_id)+'/products'),panel=el.querySelector('[data-products]');
  panel.innerHTML=`<h3 style="margin-top:20px">${esc(supplier.company)}</h3><div class="mp-grid">${products.filter(p=>p.active).map(p=>`<div class="mp-card"><strong>${esc(p.name)}</strong><p>${esc(p.category)} · ${esc(p.brand)}<br>${money(p.price)} / ${esc(p.unit)}<br>Available: ${p.stock}</p><button data-add="${esc(p.id)}" ${p.stock<=0?'disabled':''}>Add material</button></div>`).join('')||'<p>This registered company has no active products yet.</p>'}</div>`;
  bind(panel,'[data-add]',b=>{const p=products.find(p=>p.id===b.dataset.add);if(!selected.has(p.id))selected.set(p.id,{...p,company:supplier.company,quantity:Math.min(1,p.stock)});cart();});
 });
 form.addEventListener('input',preview);
 form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{await action('proposal',{...formData(form),items:[...selected.values()].map(p=>({product_id:p.id,quantity:p.quantity}))});}catch(err){error(el,err);b.disabled=false;}});
 if(previous){for(const supplierId of new Set(previous.items.map(i=>i.supplier_id))){try{const {data:products}=await api('/suppliers/'+encodeURIComponent(supplierId)+'/products');for(const old of previous.items.filter(i=>i.supplier_id===supplierId)){const p=products.find(p=>p.id===old.product_id);if(p&&p.active)selected.set(p.id,{...p,company:old.company,quantity:old.quantity});}}catch(e){error(el,e);}}}
 cart();
}
async function renderSupplier(el){
 el.classList.add('mp');el.innerHTML='<p>Loading supplier dashboard…</p>';
 try{
  const me=await api('/me');if(me.user.kind!=='supplier')throw new Error('Sign in with a supplier account.');
  el.innerHTML='<h1>Supplier dashboard</h1><p>Your registered company and active products are available to contractors when they prepare project budgets.</p><div data-profile-panel></div><div data-catalog></div>';
  await renderProfile(el.querySelector('[data-profile-panel]'),me,()=>renderSupplier(el));
  if(!me.profile)return;
  const {data:products}=await api('/suppliers/'+me.user.id+'/products'),panel=el.querySelector('[data-catalog]');
  panel.innerHTML=`<div class="mp-card"><h2>Product catalog</h2><p>Prices are per listed unit, before proposal-level tax and delivery/other costs.</p><form data-product><input type="hidden" name="id"><div class="mp-grid">${field('name','Product name','','text','required maxlength="150"')}${field('brand','Brand / manufacturer')}
  <label>Category<select name="category">${me.categories.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>${field('unit','Unit (bag, piece, kg, metre…)','','text','required maxlength="30"')}${field('price','Unit price ₹','','number','min="0.01" step="0.01" required')}${field('stock','Available quantity',0,'number','min="0" step="0.01" required')}</div><label><input type="checkbox" name="active" checked>Active product</label><button>Save product</button><button type="reset" class="secondary">Clear</button></form></div><div class="mp-grid">${products.map(p=>`<div class="mp-card"><h3>${esc(p.name)}</h3><p>${esc(p.category)} · ${esc(p.brand)}<br>${money(p.price)}/${esc(p.unit)} · Stock: ${p.stock}<br>${p.active?'Active':'Inactive'}</p><button data-edit="${esc(p.id)}">Edit product</button></div>`).join('')}</div>`;
  const form=panel.querySelector('form');
  bind(panel,'[data-edit]',b=>{const p=products.find(p=>p.id===b.dataset.edit);for(const key of ['id','name','brand','category','unit','price','stock'])form.elements[key].value=p[key];form.elements.active.checked=p.active;form.scrollIntoView({behavior:'smooth'});});
  form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{const v=formData(form);v.active=form.elements.active.checked;await api('/products'+(v.id?'/'+encodeURIComponent(v.id):''),v,v.id?'PUT':'POST');await renderSupplier(el);}catch(err){error(panel,err);b.disabled=false;}});
 }catch(e){el.innerHTML='<h1>Supplier dashboard</h1>';error(el,e);}
}
root.MarketplaceUI={renderComparison,renderContractor,renderSupplier,renderJob,api};
document.addEventListener('DOMContentLoaded',()=>{const el=document.querySelector('[data-marketplace]');if(!el)return;const params=new URLSearchParams(location.search);if(el.dataset.marketplace==='compare')renderComparison(el,params.get('projectId'));else if(el.dataset.marketplace==='supplier')renderSupplier(el);else renderContractor(el);});
})(window);
