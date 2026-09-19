// ============================================================
// OH I SEE — Projects Route
// AI Construction Platform: Central Project Management
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');
const { getUserExtras, mergeUserProfile } = require('../services/userProfileStore');
const domain = require('../services/constructionDomain');
const projectStore = require('../services/projectMemoryStore');
const {
  isProjectsDbUnavailable,
  generateUniqueProjectId,
  listMemoryProjectsForUser,
  findMemoryProject,
  saveMemoryProject,
  updateMemoryProject,
  mergeProjects,
} = projectStore;
function context(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) domain.fail('Invalid project context.');
  const out = {start_date:domain.date(value.start_date,'Start date'), duration_months:domain.number(value.duration_months,'Duration',1,120), parking:value.parking===true};
  if (value.lat != null || value.lng != null) {out.lat=domain.number(value.lat,'Latitude',-90,90);out.lng=domain.number(value.lng,'Longitude',-180,180);}
  return out;
}
function validateRequirements(body) {
  if (body.project_name !== undefined) domain.text(body.project_name, 'project_name', 120);
  if (body.city !== undefined && String(body.city).trim()) domain.text(body.city, 'city', 120);
  if (body.description !== undefined && String(body.description).trim()) {
    domain.text(body.description, 'description', 2000);
  }
  for (const key of ['budget','floors','bedrooms','bathrooms']) if (body[key] !== undefined) domain.number(body[key],key,0,key==='budget'?1000000000:100);
}

// ── Helper: enforce project ownership ─────────────────────
async function getOwnedProject(projectId, userId, res) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) return data;

  if (error && !isProjectsDbUnavailable(error)) {
    if (res) res.status(503).json({ error: 'Project storage unavailable.' });
    return null;
  }

  if (!error && !data) {
    const { data: projById } = await supabase
      .from('projects')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();
    if (projById) {
      if (!projById.user_id || projById.user_id === 'sample-user-id' || projById.user_id === 'guest' || projById.user_id === 'draft') {
        try {
          await supabase.from('projects').update({ user_id: userId }).eq('project_id', projectId);
          projById.user_id = userId;
        } catch { /* ignore update error */ }
        return projById;
      }
      if (projById.user_id === userId) return projById;
    }
  }

  const memory = findMemoryProject(projectId, userId);
  if (memory) {
    if (!memory.user_id || memory.user_id === 'sample-user-id' || memory.user_id === 'guest' || memory.user_id === 'draft') {
      memory.user_id = userId;
    }
    return memory;
  }

  if (res) res.status(404).json({ error: 'Project not found or access denied' });
  return null;
}

function normalizeCity(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCityFromLocation(location) {
  if (!location) return '';
  const first = String(location).split(',')[0].trim();
  return normalizeCity(first);
}

function getLeadCity(project) {
  const ctx = project.construction_context || {};
  const ps = ctx.projectSetup || {};
  const plot = ctx.homeRequirements?.plot?.location || {};
  const landSite = ctx.landSite || {};
  const candidates = [
    project.city,
    ps.city,
    landSite.city,
    plot.city,
    project.district,
    plot.district,
  ];
  for (const value of candidates) {
    const normalized = normalizeCity(value);
    if (normalized) return normalized;
  }
  return parseCityFromLocation(project.location);
}

function resolveLeadLocation(project) {
  const ctx = project.construction_context || {};
  const ps = ctx.projectSetup || {};
  const plot = ctx.homeRequirements?.plot?.location || {};
  const cityRaw = project.city || ps.city || plot.city || String(project.location || '').split(',')[0].trim() || '';
  const stateRaw = project.state || ps.state || plot.state || '';
  return {
    city: cityRaw || 'Tamil Nadu',
    state: stateRaw || 'Tamil Nadu',
  };
}

function isOpenVendorLead(project) {
  const status = String(project.status || '').toLowerCase();
  const accStatus = String(project.acceptance_status || '').toLowerCase();
  if (accStatus === 'accepted') return false;
  if (accStatus === 'pending_vendor') return true;
  if (!accStatus) return true;
  const openStatuses = [
    'active', 'draft', 'builder_selected', 'submitted',
    'awaiting_vendor', 'design_pending', 'design_generated',
    'awaiting_builder', 'customer_approved', 'in_execution',
  ];
  return openStatuses.includes(status);
}

function getVendorServiceCity(user) {
  return normalizeCity(user?.city) || 'coimbatore';
}

function leadMatchesVendorCity(project, vendorCity) {
  if (!vendorCity) return true;
  const leadCity = getLeadCity(project);
  if (!leadCity) return false;
  return leadCity === vendorCity
    || leadCity.includes(vendorCity)
    || vendorCity.includes(leadCity);
}

const inMemoryProjects = [
  {
    id: 101,
    project_id: 'PRJ-88412',
    user_id: 'sample-user-id',
    client_name: 'Karthik Subramanian',
    project_name: '3BHK Villa Construction - Peelamedu',
    project_type: 'Residential',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    location: 'Peelamedu, Coimbatore',
    plot_size: '40 x 60 ft',
    built_up_area: '2400 sq.ft',
    floors: 2,
    bedrooms: 3,
    bathrooms: 3,
    budget: 4800000,
    quality_level: 'Standard',
    status: 'active',
    acceptance_status: 'pending_vendor',
    current_stage: 'Requirement',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: '3BHK Villa with modern Vastu-compliant layout, covered parking, and rooftop terrace.',
    estimated_cost: 4800000,
    district: 'Coimbatore',
    construction_context: {
      requirementsPublished: true,
      intentType: 'NEW_HOME',
      parking: true,
      start_date: '2026-11-01',
      duration_months: 14,
      intentAnswers: {
        location: 'Coimbatore',
        plot_length: '40',
        plot_width: '60',
        road_facing: 'East',
        floors: 'G + 1 Floor',
        bedrooms: '3 Bedrooms',
        bathrooms: '3',
        parking: '2 Cars',
        has_pooja: 'Yes',
        has_office: 'No',
        has_terrace: 'Yes',
        vastu: 'Yes — follow Vastu',
        arch_style: 'Contemporary / Modern',
        quality: 'Standard — Balanced quality',
        budget: '4800000',
        start_date: '3-6 months',
        extras: 'Rooftop terrace and Vastu-compliant layout'
      },
      homeRequirements: {
        projectType: 'new_construction',
        plot: { lengthFt: 40, widthFt: 60, areaSqFt: 2400, shape: 'rectangle', roadFacing: 'east', location: { city: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu', pincode: '641004', country: 'India' } },
        building: { floors: 2, bedrooms: 3, bathrooms: 3, livingRooms: 1, dining: true, kitchenType: 'modular', preferredBuiltUpAreaSqFt: 2400, futureFloorProvision: false },
        parking: { cars: 2, bikes: 2 },
        outdoor: { garden: true, terrace: true, compoundWall: true },
        preferences: { vastu: true, solarReady: true, rainwaterHarvest: true },
        budget: { amount: 4800000, package: 'standard', flexibility: 'moderate' }
      }
    }
  },
  {
    id: 104,
    project_id: 'PRJ-55891',
    user_id: 'sample-user-chennai-2',
    client_name: 'Priya Menon',
    project_name: '3BHK Home - Chennai',
    project_type: 'Residential',
    intent_type: 'NEW_HOME',
    city: 'Chennai',
    state: 'Tamil Nadu',
    location: 'Chennai',
    plot_size: '60 x 40 ft',
    plot_length: 60,
    plot_width: 40,
    road_facing: 'East',
    built_up_area: '1560 sq.ft',
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    parking_count: 2,
    budget: 5000000,
    quality_level: 'Premium',
    status: 'active',
    acceptance_status: 'pending_vendor',
    current_stage: 'Requirement',
    created_at: new Date().toISOString(),
    description: 'Premium 3BHK with east-facing plot and partly Vastu-aligned layout.',
    estimated_cost: 4836000,
    district: 'Chennai',
    construction_context: {
      requirementsPublished: true,
      intentType: 'NEW_HOME',
      intentAnswers: {
        location: 'Chennai',
        plot_length: '60',
        plot_width: '40',
        road_facing: 'East',
        floors: 'Ground Floor Only',
        bedrooms: '3 Bedrooms',
        bathrooms: '2',
        parking: '2 Cars',
        has_pooja: 'No',
        has_office: 'No',
        has_terrace: 'No',
        vastu: 'Partly follow Vastu',
        arch_style: 'No Preference',
        quality: 'Premium — Higher-end finishes',
        budget: '5000000',
        start_date: '3-6 months'
      },
      homeRequirements: {
        projectType: 'new_construction',
        plot: { lengthFt: 60, widthFt: 40, areaSqFt: 2400, roadFacing: 'east', location: { city: 'Chennai', state: 'Tamil Nadu' } },
        building: { floors: 1, bedrooms: 3, bathrooms: 2, preferredBuiltUpAreaSqFt: 1560 },
        parking: { cars: 2 },
        preferences: { vastu: 'partial' },
        budget: { amount: 5000000, package: 'premium' }
      }
    }
  },
  {
    id: 102,
    project_id: 'PRJ-92107',
    user_id: 'sample-user-chennai',
    client_name: 'Anitha Sharma',
    project_name: '2BHK Apartment Renovation - Anna Nagar',
    project_type: 'Residential',
    city: 'Chennai',
    state: 'Tamil Nadu',
    location: 'Anna Nagar, Chennai',
    plot_size: '1200 sq.ft',
    built_up_area: '1100 sq.ft',
    floors: 1,
    bedrooms: 2,
    bathrooms: 2,
    budget: 2200000,
    quality_level: 'Premium',
    status: 'active',
    acceptance_status: 'pending_vendor',
    current_stage: 'Requirement',
    created_at: new Date().toISOString(),
    description: 'Full interior renovation with modular kitchen and bathroom upgrade.',
    estimated_cost: 2200000,
    district: 'Chennai',
    construction_context: { requirementsPublished: true, homeRequirements: { plot: { location: { city: 'Chennai', state: 'Tamil Nadu' } }, building: { floors: 1, bedrooms: 2, bathrooms: 2 }, budget: { amount: 2200000 } } }
  },
  {
    id: 103,
    project_id: 'PRJ-77331',
    user_id: 'sample-user-bangalore',
    client_name: 'Vikram Reddy',
    project_name: 'Commercial Showroom - Whitefield',
    project_type: 'Commercial',
    city: 'Bangalore',
    state: 'Karnataka',
    location: 'Whitefield, Bangalore',
    built_up_area: '3200 sq.ft',
    floors: 1,
    budget: 6500000,
    quality_level: 'Standard',
    status: 'active',
    acceptance_status: 'pending_vendor',
    current_stage: 'Requirement',
    created_at: new Date().toISOString(),
    description: 'Ground-floor commercial showroom with glass facade and HVAC provision.',
    estimated_cost: 6500000,
    district: 'Bangalore',
    construction_context: { requirementsPublished: true, homeRequirements: { plot: { location: { city: 'Bangalore', state: 'Karnataka' } }, building: { floors: 1 }, budget: { amount: 6500000 } } }
  }
];

projectStore.bindProjects(inMemoryProjects);

const PROJECT_ALLOWED_FIELDS = [
  'project_name', 'project_type', 'location', 'state', 'district', 'city',
  'plot_size', 'built_up_area', 'floors', 'bedrooms', 'bathrooms', 'budget',
  'quality_level', 'description', 'plot_length', 'plot_width', 'road_facing',
  'parking_count', 'has_pooja', 'has_office', 'has_terrace', 'vastu_preference',
  'architectural_style', 'intent_type', 'construction_context', 'current_stage',
  'status', 'acceptance_status', 'estimated_cost',
];

function buildProjectRow(body) {
  const row = Object.fromEntries(
    PROJECT_ALLOWED_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])
  );
  row.project_id = generateUniqueProjectIdWithVendorIds();
  return row;
}

// ── GET /api/projects — list user's projects ───────────────
router.get('/', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false });

  if (error && isProjectsDbUnavailable(error)) {
    const memory = listMemoryProjectsForUser(req.user.id);
    return res.json({
      success: true,
      data: memory,
      source: 'memory',
      warning: 'Projects table not found — using in-memory store. Apply database/schema_v2.sql.',
    });
  }
  if (error) return res.status(503).json({ error: 'Project storage unavailable.' });

  res.json({ success: true, data: mergeProjects(data, req.user.id) });
});

router.get('/:projectId', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('project_id', req.params.projectId)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (!error && data) return res.json({ success: true, data });

  if (error && !isProjectsDbUnavailable(error)) {
    return res.status(503).json({ error: 'Project storage unavailable.' });
  }

  const memory = findMemoryProject(req.params.projectId, req.user.id);
  if (!memory || memory.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  return res.json({ success: true, data: memory, source: 'memory' });
});

router.post('/', authenticate, async (req, res) => {
  try {
    validateRequirements(req.body);
    if (!req.body.project_name?.trim()) {
      return res.status(400).json({ error: 'Project name is required.' });
    }

    const row = buildProjectRow(req.body);
    row.user_id = req.user.id;

    const { data, error } = await supabase.from('projects').insert(row).select().single();
    if (!error && data) {
      return res.status(201).json({ success: true, data });
    }

    if (error && !isProjectsDbUnavailable(error)) throw error;

    const saved = saveMemoryProject(row, req.user.id);
    return res.status(201).json({
      success: true,
      data: saved,
      source: 'memory',
      warning: 'Projects table not found — saved in-memory only. Apply database/schema_v2.sql for persistence.',
    });
  } catch (e) {
    res.status(e.status || 503).json({
      error: e.status ? e.message : 'Project could not be saved.',
      details: e.message,
    });
  }
});

// ── PUT /api/projects/:projectId — update project ──────────
router.put('/:projectId', authenticate, async (req, res) => {
  try {
    validateRequirements(req.body);
    // Verify ownership first
    const existing = await getOwnedProject(req.params.projectId, req.user.id, res);
    if (!existing) return;

    const allowedFields = [
      'project_name', 'project_type', 'location', 'state', 'district', 'city',
      'plot_size', 'built_up_area', 'floors', 'bedrooms', 'bathrooms',
      'budget', 'quality_level', 'status', 'current_stage', 'description',
      'progress_design', 'progress_boq', 'progress_estimate',
      'progress_products', 'progress_procurement', 'progress_construction',
      'estimated_cost', 'ai_analysis', 'boq_data', 'construction_context'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.construction_context !== undefined) updates.construction_context = {...existing.construction_context,...context(updates.construction_context)};
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('project_id', req.params.projectId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (!error && data) return res.json({ success: true, data });

    if (error && !isProjectsDbUnavailable(error)) throw error;

    const updated = updateMemoryProject(req.params.projectId, req.user.id, updates);
    if (!updated) return res.status(404).json({ error: 'Project not found or access denied' });
    return res.json({ success: true, data: updated, source: 'memory' });
  } catch (err) {
    console.error('PUT /api/projects/:id error:', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to update project' });
  }
});

// In-memory fallback stores for high resilience
const inMemoryEmployees = [];
const inMemoryDeals = {};
const inMemoryVendorProjects = [];

function generateUniqueProjectIdWithVendorIds() {
  return generateUniqueProjectId(inMemoryVendorProjects.map((p) => p.project_id));
}

function findSourceLead(projectId) {
  const memLead = inMemoryProjects.find((p) => p.project_id === projectId);
  if (memLead) return formatLeadForVendor(memLead);
  const vendorCopy = inMemoryVendorProjects.find((p) => p.client_lead_id === projectId || p.project_id === projectId);
  if (vendorCopy) return vendorCopy;
  return null;
}

function resolveClientContact(project, clientUser) {
  const ctx = project.construction_context || {};
  const contact = ctx.clientContact || ctx.client || {};
  const user = clientUser || project.users || null;
  const userExtras = user?.id ? getUserExtras(user.id) : {};
  return {
    client_name: project.client_name || contact.name || ctx.clientName || ctx.client_name || user?.name || '',
    client_email: project.client_email || contact.email || ctx.clientEmail || user?.email || '',
    client_phone: project.client_phone || contact.phone || ctx.clientPhone || user?.phone || '',
    client_profile_image: project.client_profile_image
      || contact.profile_image
      || ctx.clientProfileImage
      || ctx.client_profile_image
      || user?.profile_image
      || userExtras.profile_image
      || ''
  };
}

function formatLeadForVendor(project, clientUser) {
  const ctx = project.construction_context || {};
  const ps = ctx.projectSetup || {};
  const req = ctx.homeRequirements || {};
  const plot = req.plot || {};
  const building = req.building || {};
  const loc = resolveLeadLocation(project);
  const budget = req.budget?.amount ?? project.budget ?? ps.estimated_budget ?? 0;
  const builtUp = project.built_up_area
    || (ps.built_up_area ? `${ps.built_up_area} sq.ft` : '')
    || building.preferredBuiltUpAreaSqFt
    || '';
  const description = project.description
    || ps.description
    || req.outputs?.summary
    || (plot.areaSqFt ? `${building.bedrooms || project.bedrooms || ''} bedroom home on ${plot.areaSqFt} sq.ft plot` : 'Client construction requirement');
  const client = resolveClientContact(project, clientUser);

  return {
    project_id: project.project_id,
    project_name: project.project_name,
    project_type: project.project_type || 'Residential',
    intent_type: project.intent_type || ctx.intentType || ctx.intent_type || null,
    city: loc.city,
    state: loc.state,
    plot_size: project.plot_size || (plot.lengthFt && plot.widthFt ? `${plot.lengthFt} x ${plot.widthFt} ft` : ''),
    plot_length: project.plot_length || plot.lengthFt || null,
    plot_width: project.plot_width || plot.widthFt || null,
    road_facing: project.road_facing || plot.roadFacing || '',
    built_up_area: builtUp,
    floors: project.floors || building.floors || 1,
    bedrooms: project.bedrooms || building.bedrooms,
    bathrooms: project.bathrooms || building.bathrooms,
    parking_count: project.parking_count ?? req.parking?.cars ?? null,
    has_pooja: project.has_pooja ?? req.outdoor?.pooja ?? null,
    has_office: project.has_office ?? req.outdoor?.office ?? null,
    has_terrace: project.has_terrace ?? req.outdoor?.terrace ?? null,
    vastu_preference: project.vastu_preference ?? req.preferences?.vastu ?? null,
    architectural_style: project.architectural_style || req.preferences?.style || '',
    budget,
    quality_level: project.quality_level || req.budget?.package || 'Standard',
    current_stage: project.current_stage || 'Requirement',
    acceptance_status: project.acceptance_status || inMemoryDeals[project.project_id]?.acceptance_status || 'pending_vendor',
    description,
    requirements: req,
    intent_answers: ctx.intentAnswers || ctx.intent_answers || null,
    ai_insights: ctx.aiInsights || req.outputs || null,
    location: project.location || '',
    district: project.district || plot.location?.district || '',
    estimated_cost: project.estimated_cost || budget,
    construction_context: ctx,
    client_name: client.client_name,
    client_email: client.client_email,
    client_phone: client.client_phone,
    client_profile_image: client.client_profile_image,
    created_at: project.created_at || new Date().toISOString()
  };
}

function isProviderAccount(user) {
  return user.role === 'Partner'
    || ['Contractor', 'Vendor', 'Supplier'].includes(user.partner_type)
    || ['Contractor', 'Vendor', 'Supplier'].includes(user.role);
}

// ── GET /api/projects/leads — list open project leads for contractors/vendors ────────
const marketplaceService = require('../services/marketplaceService');
const marketplaceDomain = require('../services/marketplaceDomain');
router.get('/leads/all', authenticate, async (req,res,next) => {
  try {
    if(!marketplaceDomain.eligible(req.user,'contractor')) domain.fail('Contractor account required.',403);
    const jobs=await marketplaceService.result(supabase.from('marketplace_jobs').select('*').eq('contractor_id',req.user.id).order('updated_at',{ascending:false}));
    res.json({success:true,data:jobs.filter(j=>j.data.stage==='requested').map(j=>({...j.data.project,marketplace_job_id:j.id,acceptance_status:'pending_vendor'}))});
  }catch(e){next(e);}
});
router.get('/vendor/accepted', authenticate, async (req,res,next) => {
  try {
    if(!marketplaceDomain.eligible(req.user,'contractor')) domain.fail('Contractor account required.',403);
    const jobs=await marketplaceService.result(supabase.from('marketplace_jobs').select('*').eq('contractor_id',req.user.id));
    res.json({success:true,data:jobs.filter(j=>j.data.stage!=='requested').map(j=>({...j.data.project,marketplace_job_id:j.id,client_lead_id:j.project_id,acceptance_status:'accepted',status:j.data.stage}))});
  }catch(e){next(e);}
});
router.post('/:projectId/accept', authenticate, async (req,res,next) => {
  try {
    if(!marketplaceDomain.eligible(req.user,'contractor')) domain.fail('Contractor account required.',403);
    const job=await marketplaceService.result(supabase.from('marketplace_jobs').select('*').eq('project_id',req.params.projectId).eq('contractor_id',req.user.id).maybeSingle());
    if(!job) domain.fail('Selected client lead not found.',404);
    const updated=await marketplaceService.action(job.id,req.user,{action:'accept',version:job.version});
    res.json({success:true,data:{...updated,project_id:job.project_id,client_lead_id:job.project_id}});
  }catch(e){next(e);}
});

// ── GET /api/projects/:projectId/employees — list site employees ────────
router.get('/:projectId/employees', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;

    let employees = [];
    try {
      const { data, error } = await supabase
        .from('project_employees')
        .select('*')
        .eq('project_id', projectId);

      if (!error && data) employees = data;
    } catch (e) {}

    // Merge in-memory assigned employees
    const memList = inMemoryEmployees.filter(e => e.project_id === projectId);
    const combined = [...employees, ...memList];

    res.json({ success: true, data: combined });
  } catch (err) {
    console.error('GET /api/projects/:id/employees error:', err.message);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

// ── POST /api/projects/:projectId/employees — assign site worker ────────
router.post('/:projectId/employees', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      employee_name,
      role = 'Site Worker',
      worker_type = 'Labourer',
      email = '',
      phone = '',
      experience_years = null,
      is_fresher = false,
      aadhar_id = '',
      pan_id = '',
      profile_image = '',
      wage_type = 'daily',
      wage_rate = 0,
      advance_paid = 0
    } = req.body;

    if (!employee_name || !employee_name.trim()) {
      return res.status(400).json({ error: 'Employee name is required' });
    }

    const empObj = {
      emp_id: 'EMP-' + Math.floor(1000 + Math.random() * 9000),
      project_id: projectId,
      vendor_id: req.user.id,
      employee_name: employee_name.trim(),
      role,
      worker_type,
      email,
      phone,
      experience_years: is_fresher ? 0 : (parseInt(experience_years, 10) || 0),
      is_fresher: !!is_fresher,
      aadhar_id,
      pan_id,
      profile_image,
      wage_type, // 'daily' | 'monthly' | 'milestone' | 'completion'
      wage_rate: parseFloat(wage_rate) || 0,
      advance_paid: parseFloat(advance_paid) || 0,
      status: 'active',
      assigned_at: new Date().toISOString()
    };

    inMemoryEmployees.push(empObj);

    try {
      await supabase.from('project_employees').insert([empObj]);
    } catch (dbErr) {
      console.warn('Supabase employee insert fallback:', dbErr.message);
    }

    console.log(`[EMPLOYEE ASSIGNED] ${empObj.employee_name} (${empObj.role}) to Project ${projectId}`);
    res.status(201).json({ success: true, message: 'Employee assigned to project successfully', data: empObj });
  } catch (err) {
    console.error('POST /api/projects/:id/employees error:', err.message);
    res.status(500).json({ error: 'Failed to assign employee' });
  }
});

// ── PUT /api/projects/:projectId/employees/:empId — update site worker ───
router.put('/:projectId/employees/:empId', authenticate, async (req, res) => {
  try {
    const { projectId, empId } = req.params;
    const allowed = [
      'employee_name', 'role', 'worker_type', 'email', 'phone', 'experience_years',
      'is_fresher', 'aadhar_id', 'pan_id', 'profile_image', 'wage_type', 'wage_rate', 'advance_paid', 'status'
    ];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (updates.employee_name !== undefined && !String(updates.employee_name).trim()) {
      return res.status(400).json({ error: 'Employee name is required' });
    }
    if (updates.is_fresher) updates.experience_years = 0;

    const idx = inMemoryEmployees.findIndex(
      (e) => (e.emp_id === empId || String(e.id) === String(empId)) && e.project_id === projectId
    );
    if (idx < 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    inMemoryEmployees[idx] = {
      ...inMemoryEmployees[idx],
      ...updates,
      employee_name: updates.employee_name?.trim() || inMemoryEmployees[idx].employee_name,
      updated_at: new Date().toISOString()
    };

    try {
      await supabase.from('project_employees').update(inMemoryEmployees[idx]).eq('emp_id', empId);
    } catch (_) {}

    res.json({ success: true, message: 'Employee updated successfully', data: inMemoryEmployees[idx] });
  } catch (err) {
    console.error('PUT /api/projects/:id/employees/:empId error:', err.message);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// ── DELETE /api/projects/:projectId/employees/:empId ─────────────────────
router.delete('/:projectId/employees/:empId', authenticate, async (req, res) => {
  try {
    const { projectId, empId } = req.params;

    const idx = inMemoryEmployees.findIndex(e => e.emp_id === empId || e.id == empId);
    if (idx >= 0) inMemoryEmployees.splice(idx, 1);

    try {
      await supabase.from('project_employees').delete().eq('emp_id', empId);
    } catch (e) {}

    res.json({ success: true, message: 'Employee removed from project' });
  } catch (err) {
    console.error('DELETE /api/projects/:id/employees/:empId error:', err.message);
    res.status(500).json({ error: 'Failed to remove employee' });
  }
});

// ── GET /api/projects/:projectId/progress ─────────────────
router.get('/:projectId/progress', authenticate, async (req, res) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id, res);
    if (!project) return;

    const stages = [
      { name: 'Design', value: project.progress_design },
      { name: 'BOQ', value: project.progress_boq },
      { name: 'Estimate', value: project.progress_estimate },
      { name: 'Products', value: project.progress_products },
      { name: 'Procurement', value: project.progress_procurement },
      { name: 'Construction', value: project.progress_construction }
    ];

    const overall = Math.round(stages.reduce((sum, s) => sum + s.value, 0) / stages.length);

    res.json({
      success: true,
      data: {
        project_id: project.project_id,
        current_stage: project.current_stage,
        overall_progress: overall,
        stages
      }
    });
  } catch (err) {
    console.error('GET /api/projects/:id/progress error:', err.message);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

module.exports = router;
