'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');
const projectStore = require('../services/projectMemoryStore');
const { projectCompletionPercent } = require('../services/portalCompletion');

const router = express.Router();
router.use(authenticate);

const WORKFLOW_STEPS = [
  'Project Setup', 'Land & Site', 'Requirements', 'Design & Engineering',
  'Builder Quotes', 'Approvals', 'Project Execution', 'Handover & Maintenance',
];

const CONSTRUCTION_STAGES = [
  'Site Preparation', 'Foundation', 'Plinth', 'Structure', 'Brickwork', 'Roofing',
  'Electrical', 'Plumbing', 'Plastering', 'Flooring', 'Doors & Windows', 'Painting',
  'Fixtures', 'External Works', 'Final Inspection', 'Handover',
];

function isDbMissing(error) {
  return projectStore.isProjectsDbUnavailable(error);
}

async function getOwnedProject(projectId, userId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!error && data) return data;
  if (error && !isDbMissing(error)) throw Object.assign(new Error('Project storage unavailable'), { status: 503 });

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

  const memory = projectStore.findMemoryProject(projectId, userId);
  if (memory) {
    if (!memory.user_id || memory.user_id === 'sample-user-id' || memory.user_id === 'guest' || memory.user_id === 'draft') {
      memory.user_id = userId;
    }
    return memory;
  }
  return null;
}

async function listUserProjects(userId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (!error) return data || [];
  if (!isDbMissing(error)) throw Object.assign(new Error('Project storage unavailable'), { status: 503 });
  return projectStore.listMemoryProjectsForUser(userId);
}

async function safeSelect(table, filters) {
  let q = supabase.from(table).select('*');
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error && isDbMissing(error)) return [];
  if (error) throw error;
  return data || [];
}

// Budgets in saved wizard answers may include INR symbols and Indian grouping.
function designCostEstimate(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const normalized = typeof value === 'number' ? value : String(value).replace(/[₹,\s]/g, '');
    if (normalized === '') continue;
    const amount = Number(normalized);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return null;
}
function workflowProgress(project) {
  return projectCompletionPercent(project);
}

function formatStatusLabel(status) {
  const s = String(status || 'draft').toLowerCase();
  const map = {
    draft: 'Draft',
    active: 'Active',
    submitted: 'Submitted',
    design_pending: 'Design Pending',
    design_generated: 'Design Generated',
    awaiting_builder: 'Awaiting Builder',
    builder_selected: 'Builder Selected',
    customer_approved: 'Customer Approved',
    in_execution: 'In Execution',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[s] || (s.charAt(0).toUpperCase() + s.slice(1));
}

function projectCard(project) {
  if (!project || typeof project !== 'object') return null;
  const ctx = project.construction_context || {};
  const ps = ctx.projectSetup || {};
  const ls = ctx.landSite || {};
  const step = project.workflow_step || ctx.wizardStep || 1;
  const completion = project.completion_percentage ?? project.workflow_progress ?? projectCompletionPercent(project);
  return {
    project_id: project.project_id,
    project_name: project.project_name,
    project_type: project.project_type || ps.project_type,
    location: project.location || `${ps.city || ''}, ${ps.state || ''}`.trim().replace(/^,\s*|,\s*$/g, ''),
    plot_size: project.plot_size || (ls.plot_length_ft && ls.plot_width_ft ? `${ls.plot_length_ft} x ${ls.plot_width_ft} ft` : ''),
    built_up_area: project.built_up_area || ps.built_up_area,
    budget: project.budget || ps.estimated_budget,
    selected_builder: project.selected_builder || ctx.selectedBuilder || null,
    current_stage: project.current_stage || WORKFLOW_STEPS[step - 1],
    workflow_step: step,
    workflow_step_label: `Step ${step} — ${WORKFLOW_STEPS[step - 1]}`,
    progress_pct: completion,
    completion_percentage: completion,
    status: project.status || 'draft',
    status_label: formatStatusLabel(project.status),
    start_date: project.start_date || ps.start_date,
    target_completion_date: project.target_completion_date || ps.target_completion_date,
    created_at: project.created_at,
    updated_at: project.updated_at,
    last_saved_at: project.last_saved_at || project.updated_at,
  };
}

function matchesStatusFilter(project, filter) {
  const f = String(filter || 'all').toLowerCase();
  const s = String(project.status || 'draft').toLowerCase();
  if (f === 'all' || !f) return true;
  if (f === 'draft' || f === 'drafts') return s === 'draft';
  if (f === 'active') {
    return ['active', 'submitted', 'design_pending', 'design_generated', 'awaiting_builder',
      'builder_selected', 'customer_approved', 'in_execution'].includes(s);
  }
  if (f === 'completed') return s === 'completed';
  return s === f;
}

// ── Dashboard ─────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const projects = await listUserProjects(req.user.id);
    const cards = projects.map(projectCard).filter(Boolean);
    const active = cards.filter((p) => !['completed', 'cancelled'].includes(String(p.status).toLowerCase()));
    const pendingApprovals = active.filter((p) => p.workflow_step >= 6).length;
    res.json({
      success: true,
      data: {
        active_projects: active.length,
        projects: cards,
        pending_approvals: pendingApprovals,
        total_budget: active.reduce((s, p) => s + (parseFloat(String(p.budget).replace(/[^\d.]/g, '')) || 0), 0),
        workflow_steps: WORKFLOW_STEPS,
      },
    });
  } catch (err) { next(err); }
});

// ── Projects list with filters ────────────────────────────
router.get('/projects', async (req, res, next) => {
  try {
    const { status, q } = req.query;
    let projects = (await listUserProjects(req.user.id)).map(projectCard).filter(Boolean);
    if (status && status !== 'all') {
      projects = projects.filter((p) => matchesStatusFilter(p, status));
    }
    if (q) {
      const needle = String(q).toLowerCase();
      projects = projects.filter((p) =>
        p.project_name?.toLowerCase().includes(needle)
        || p.project_id?.toLowerCase().includes(needle)
        || p.location?.toLowerCase().includes(needle));
    }
    res.json({ success: true, data: projects });
  } catch (err) { next(err); }
});

// ── Project summary (sidebar) ─────────────────────────────
router.get('/projects/:projectId/summary', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ctx = project.construction_context || {};
    res.json({
      success: true,
      data: {
        ...projectCard(project),
        facing: ctx.projectSetup?.facing_direction || project.facing_direction,
        floors: ctx.projectSetup?.floors || project.floors,
        construction_context: ctx,
        bim_status: project.bim_generation_status,
        amount_paid: project.amount_paid || 0,
        contract_value: project.contract_value || project.estimated_cost || 0,
      },
    });
  } catch (err) { next(err); }
});

// ── Save project draft (manual + auto-save) ───────────────
router.put('/projects/:projectId/draft', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const ctx = { ...(project.construction_context || {}) };
    if (req.body.projectSetup) ctx.projectSetup = req.body.projectSetup;
    if (req.body.landSite) ctx.landSite = req.body.landSite;
    if (req.body.requirements) {
      ctx.intentAnswers = req.body.requirements;
      ctx.projectRequirements = req.body.requirements;
    }
    if (req.body.wizardStep) ctx.wizardStep = req.body.wizardStep;

    const workflowStep = Math.min(8, Math.max(1, parseInt(req.body.workflow_step || req.body.wizardStep || project.workflow_step || 1, 10)));
    const completion = typeof req.body.completion_percentage === 'number'
      ? req.body.completion_percentage
      : projectCompletionPercent({ ...project, workflow_step: workflowStep, construction_context: ctx });
    const now = new Date().toISOString();

    const patch = {
      construction_context: ctx,
      workflow_step: workflowStep,
      workflow_progress: completion,
      completion_percentage: completion,
      status: 'draft',
      current_stage: WORKFLOW_STEPS[workflowStep - 1],
      last_saved_at: now,
      updated_at: now,
    };

    const ps = ctx.projectSetup || {};
    if (ps.project_name) patch.project_name = ps.project_name;
    if (ps.project_type) patch.project_type = ps.project_type;
    if (ps.city) patch.city = ps.city;
    if (ps.state) patch.state = ps.state;
    if (ps.city || ps.state) patch.location = `${ps.city || ''}, ${ps.state || ''}`.trim();
    if (ps.estimated_budget) patch.budget = parseFloat(String(ps.estimated_budget).replace(/[^\d.]/g, '')) || project.budget;
    if (ps.built_up_area) patch.built_up_area = `${ps.built_up_area} sq.ft`;
    if (ps.floors) {
      const floorsMap = {
        'Ground Floor Only': 1, 'G + 1': 2, 'G + 2': 3, 'G + 3': 4, 'G + 4': 5, '5+ Floors': 5,
      };
      patch.floors = floorsMap[ps.floors] || project.floors;
    }
    if (String(project.status || '').toLowerCase() !== 'draft') {
      patch.acceptance_status = 'pending_vendor';
    }

    const { data, error } = await supabase.from('projects')
      .update(patch)
      .eq('project_id', req.params.projectId)
      .eq('user_id', req.user.id)
      .select('*')
      .maybeSingle();

    if (!error && data) return res.json({ success: true, data: projectCard(data), project_id: req.params.projectId });
    if (error && !isDbMissing(error)) throw error;
    const updated = projectStore.updateMemoryProject(req.params.projectId, req.user.id, patch);
    res.json({ success: true, data: projectCard(updated), project_id: req.params.projectId });
  } catch (err) { next(err); }
});

// ── Delete draft project ──────────────────────────────────
router.delete('/projects/:projectId', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (String(project.status || '').toLowerCase() !== 'draft') {
      return res.status(400).json({ error: 'Only draft projects can be deleted from the portal.' });
    }
    const { error } = await supabase.from('projects')
      .delete()
      .eq('project_id', req.params.projectId)
      .eq('user_id', req.user.id);
    if (!error) return res.json({ success: true });
    if (error && !isDbMissing(error)) throw error;
    projectStore.deleteMemoryProject(req.params.projectId, req.user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Workflow step update ──────────────────────────────────
router.put('/projects/:projectId/workflow', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const step = Math.min(8, Math.max(1, parseInt(req.body.workflow_step, 10) || 1));
    const ctx = { ...(project.construction_context || {}), wizardStep: step };
    const completion = projectCompletionPercent({ ...project, workflow_step: step, construction_context: ctx });
    const now = new Date().toISOString();
    const patch = {
      workflow_step: step,
      workflow_progress: completion,
      completion_percentage: completion,
      current_stage: WORKFLOW_STEPS[step - 1],
      construction_context: ctx,
      last_saved_at: now,
      updated_at: now,
    };
    const { data, error } = await supabase.from('projects').update(patch).eq('project_id', req.params.projectId).eq('user_id', req.user.id).select().maybeSingle();
    if (!error && data) return res.json({ success: true, data });
    if (error && !isDbMissing(error)) throw error;
    const updated = projectStore.updateMemoryProject(req.params.projectId, req.user.id, patch);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Milestones ────────────────────────────────────────────
router.get('/projects/:projectId/milestones', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    let rows = await safeSelect('portal_milestones', { project_id: req.params.projectId });
    if (!rows.length) {
      rows = CONSTRUCTION_STAGES.map((stage, i) => ({
        id: `default-${i}`,
        project_id: req.params.projectId,
        stage,
        status: i === 0 ? 'in_progress' : 'pending',
        progress_pct: i === 0 ? 0 : 0,
        sort_order: i,
      }));
    }
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/projects/:projectId/milestones', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const row = {
      id: crypto.randomUUID(),
      project_id: req.params.projectId,
      stage: req.body.stage,
      status: req.body.status || 'pending',
      progress_pct: req.body.progress_pct || 0,
      notes: req.body.notes || '',
      sort_order: req.body.sort_order || 0,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('portal_milestones').insert(row).select().maybeSingle();
    if (error && isDbMissing(error)) {
      const ctx = project.construction_context || {};
      ctx.milestones = [...(ctx.milestones || []), row];
      projectStore.updateMemoryProject(req.params.projectId, req.user.id, { construction_context: ctx });
      return res.json({ success: true, data: row });
    }
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Site updates ──────────────────────────────────────────
router.get('/projects/:projectId/site-updates', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const rows = await safeSelect('portal_site_updates', { project_id: req.params.projectId });
    let milestones = await safeSelect('portal_milestones', { project_id: req.params.projectId });
    if (!milestones.length) {
      milestones = CONSTRUCTION_STAGES.map((stage, i) => ({
        stage, status: i === 0 ? 'in_progress' : 'pending', progress_pct: 0,
      }));
    }
    const issues = await safeSelect('portal_site_issues', { project_id: req.params.projectId });
    const done = milestones.filter((m) => m.status === 'completed').length;
    const overall = milestones.length ? Math.round((done / milestones.length) * 100) : 0;
    res.json({
      success: true,
      data: {
        updates: rows,
        milestones,
        issues,
        overall_progress: overall,
      },
    });
  } catch (err) { next(err); }
});

// ── Messages ──────────────────────────────────────────────
router.get('/projects/:projectId/messages', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const rows = await safeSelect('portal_messages', { project_id: req.params.projectId });
    res.json({ success: true, data: { messages: rows } });
  } catch (err) { next(err); }
});

router.post('/projects/:projectId/messages', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const row = {
      id: crypto.randomUUID(),
      project_id: req.params.projectId,
      sender_id: req.user.id,
      sender_name: req.user.name || req.user.email || 'Customer',
      sender_role: 'customer',
      receiver_role: req.body.receiver_role || 'builder',
      body: req.body.body || '',
      attachments: req.body.attachments || [],
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('portal_messages').insert(row).select().maybeSingle();
    if (error && isDbMissing(error)) {
      const ctx = project.construction_context || {};
      ctx.messages = [...(ctx.messages || []), row];
      projectStore.updateMemoryProject(req.params.projectId, req.user.id, { construction_context: ctx });
      return res.json({ success: true, data: row });
    }
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Payments ──────────────────────────────────────────────
router.get('/projects/:projectId/payments', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const rows = await safeSelect('portal_customer_payments', { project_id: req.params.projectId });
    const milestones = await safeSelect('portal_milestones', { project_id: req.params.projectId });
    const totalPaid = rows.filter((r) => ['completed', 'paid'].includes(String(r.status).toLowerCase()))
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const contract = Number(project.contract_value || project.estimated_cost || project.budget || 0);
    const overdue = rows.filter((r) => r.status === 'overdue').reduce((s, r) => s + Number(r.amount || 0), 0);
    const milestonePayments = milestones.map((m, i) => ({
      milestone: m.stage,
      stage: m.stage,
      amount: contract > 0 ? Math.round(contract / Math.max(milestones.length, 1)) : 0,
      due_date: m.expected_date,
      expected_date: m.expected_date,
      payment_status: m.status === 'completed' ? 'paid' : (m.status === 'in_progress' ? 'due' : 'pending'),
      status: m.status,
    }));
    res.json({
      success: true,
      data: {
        payments: rows,
        milestones: milestonePayments,
        budget: project.budget || 0,
        contract_value: contract,
        total_paid: totalPaid,
        pending: Math.max(0, contract - totalPaid),
        overdue,
      },
    });
  } catch (err) { next(err); }
});

// ── Material orders ───────────────────────────────────────
router.get('/projects/:projectId/material-orders', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const rows = await safeSelect('portal_material_orders', { project_id: req.params.projectId });
    const requirements = await safeSelect('portal_material_requirements', { project_id: req.params.projectId });
    const budgetApprovals = await safeSelect('portal_budget_approvals', { project_id: req.params.projectId, status: 'pending' });
    const ctx = project.construction_context || {};
    const materialBudget = Number(ctx.materialBudget || project.budget * 0.3 || 0);
    const committed = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const ordered = rows.filter((r) => !['draft', 'cancelled', 'rejected'].includes(String(r.order_status).toLowerCase()))
      .reduce((s, r) => s + Number(r.total_amount || 0), 0);
    let budgetWarning = null;
    if (materialBudget > 0 && committed > materialBudget) {
      budgetWarning = 'Material selection exceeds the approved project budget.';
    } else if (materialBudget > 0 && committed > materialBudget * 0.9) {
      budgetWarning = 'Approaching material budget limit.';
    }
    res.json({
      success: true,
      data: {
        orders: rows,
        requirements,
        budget_approvals: budgetApprovals,
        dashboard: {
          material_budget: materialBudget,
          committed,
          ordered,
          delivered: rows.filter((r) => String(r.order_status).toLowerCase().includes('deliver'))
            .reduce((s, r) => s + Number(r.total_amount || 0), 0),
          remaining: Math.max(0, materialBudget - committed),
          budget_warning: budgetWarning,
        },
      },
    });
  } catch (err) { next(err); }
});

const marketplace = require('../services/marketplaceService');
router.get('/projects/:projectId/quotes', async (req,res,next) => {
  try {
    const data=await marketplace.comparison(req.params.projectId,req.user.id);
    res.json({success:true,data:{...data,quote_status:data.job?data.job.data.stage:'Registered builder estimates',requirements_status:data.project.construction_context?.requirementsStatus || 'Saved',design_status:data.project.bim_generation_status || 'In progress'}});
  } catch(e) {next(e);}
});
router.post('/projects/:projectId/quotes/select', async (req,res,next) => {
  try {res.json({success:true,data:await marketplace.select(req.params.projectId,req.user.id,req.body),message:'Private lead delivered to the selected contractor.'});}catch(e){next(e);}
});
router.post('/projects/:projectId/quotes/shortlist', async (req,res) => {
  res.status(400).json({error:'Use Compare builders to review registered builders and select one for your project.'});
});

router.put('/projects/:projectId/budget-approvals/:approvalId', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const decision = req.body.decision || 'rejected';
    const patch = { status: decision, customer_decision: decision, decided_at: new Date().toISOString() };
    await supabase.from('portal_budget_approvals').update(patch)
      .eq('id', req.params.approvalId).eq('project_id', req.params.projectId);
    res.json({ success: true, data: patch });
  } catch (err) { next(err); }
});

// ── Approvals ─────────────────────────────────────────────
router.get('/projects/:projectId/approvals', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const rows = await safeSelect('portal_approvals', { project_id: req.params.projectId });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/projects/:projectId/approvals', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const total = Number(req.body.construction_cost || 0) + Number(req.body.design_cost || 0)
      + Number(req.body.approval_fees || 0) + Number(req.body.other_charges || 0);
    const budget = Number(req.body.customer_budget || project.budget || 0);
    const row = {
      id: crypto.randomUUID(),
      project_id: req.params.projectId,
      user_id: req.user.id,
      approval_type: req.body.approval_type || 'construction_start',
      construction_cost: req.body.construction_cost || 0,
      design_cost: req.body.design_cost || 0,
      approval_fees: req.body.approval_fees || 0,
      other_charges: req.body.other_charges || 0,
      total_cost: total,
      customer_budget: budget,
      budget_exceeded: total > budget,
      customer_decision: req.body.customer_decision,
      status: req.body.status || 'pending',
      notes: req.body.notes,
    };
    const { data, error } = await supabase.from('portal_approvals').insert(row).select().maybeSingle();
    if (error && isDbMissing(error)) {
      const ctx = project.construction_context || {};
      ctx.approvals = [...(ctx.approvals || []), row];
      projectStore.updateMemoryProject(req.params.projectId, req.user.id, { construction_context: ctx });
      return res.json({ success: true, data: row });
    }
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Design versions ───────────────────────────────────────
router.get('/projects/:projectId/designs', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const rows = await safeSelect('portal_design_versions', { project_id: req.params.projectId });
    const ctx = project.construction_context || {};
    const data = rows.length ? rows : (ctx.designVersions || []);
    res.json({ success: true, data, bim_status: project.bim_generation_status });
  } catch (err) { next(err); }
});

router.post('/projects/:projectId/designs', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const existing = await safeSelect('portal_design_versions', { project_id: req.params.projectId });
    const ctx = project.construction_context || {};
    const reqAnswers = ctx.intentAnswers || {};
    const row = {
      id: crypto.randomUUID(),
      project_id: req.params.projectId,
      version_number: existing.length + 1,
      created_by: req.user.name || 'Customer',
      status: 'Generated',
      packages: req.body.packages || [],
      preferences: req.body.preferences || {},
      cost_estimate: designCostEstimate(reqAnswers.budget, ctx.projectSetup?.estimated_budget, project.budget),
      boq_snapshot: {
        total_area: reqAnswers.built_up_area || ctx.projectSetup?.built_up_area || null,
      },
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('portal_design_versions').insert(row).select().maybeSingle();
    if (error && isDbMissing(error)) {
      ctx.designVersions = [...(ctx.designVersions || []), row];
      projectStore.updateMemoryProject(req.params.projectId, req.user.id, { construction_context: ctx });
      return res.json({ success: true, data: row });
    }
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/projects/:projectId/design-state', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ctx = { ...(project.construction_context || {}) };
    ctx.designEngineering = { ...(ctx.designEngineering || {}), ...req.body };
    const patch = {
      construction_context: ctx,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('projects').update(patch)
      .eq('project_id', req.params.projectId).eq('user_id', req.user.id).select().maybeSingle();
    if (!error && data) return res.json({ success: true, data: ctx.designEngineering });
    if (error && !isDbMissing(error)) throw error;
    const updated = projectStore.updateMemoryProject(req.params.projectId, req.user.id, patch);
    res.json({ success: true, data: updated?.construction_context?.designEngineering || ctx.designEngineering });
  } catch (err) { next(err); }
});

router.put('/projects/:projectId/design-approval', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const status = req.body.approval_status || 'Pending';
    const versionId = req.body.version_id;
    const ctx = { ...(project.construction_context || {}) };
    ctx.designEngineering = {
      ...(ctx.designEngineering || {}),
      selected_version_id: versionId,
      approval_status: status,
      approval_date: req.body.approval_date || null,
      approval_comments: req.body.comments || '',
    };
    if (status === 'Approved') {
      ctx.requirementsStatus = 'APPROVED';
      ctx.designStatus = 'APPROVED';
    } else if (status === 'Changes Requested') {
      ctx.designStatus = 'CHANGES_REQUESTED';
    }

    const versions = await safeSelect('portal_design_versions', { project_id: req.params.projectId });
    const memVersions = ctx.designVersions || [];
    const allVersions = versions.length ? versions : memVersions;
    for (const v of allVersions) {
      if (v.id === versionId) {
        v.status = status === 'Approved' ? 'Current' : (status === 'Changes Requested' ? 'Changes Requested' : v.status);
      } else if (status === 'Approved' && v.status === 'Current') {
        v.status = 'Generated';
      }
    }
    if (!versions.length && memVersions.length) ctx.designVersions = allVersions;

    const patch = {
      construction_context: ctx,
      updated_at: new Date().toISOString(),
      current_stage: status === 'Approved' ? 'Builder Quotes' : project.current_stage,
    };
    const { error } = await supabase.from('projects').update(patch)
      .eq('project_id', req.params.projectId).eq('user_id', req.user.id);
    if (error && !isDbMissing(error)) throw error;
    if (error) projectStore.updateMemoryProject(req.params.projectId, req.user.id, patch);

    if (versionId) {
      await supabase.from('portal_design_versions').update({
        status: status === 'Approved' ? 'Current' : status,
      }).eq('id', versionId).eq('project_id', req.params.projectId);
    }
    res.json({ success: true, data: ctx.designEngineering });
  } catch (err) { next(err); }
});

// ── Handover ──────────────────────────────────────────────
router.get('/projects/:projectId/handover', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const docs = await safeSelect('portal_handover_documents', { project_id: req.params.projectId });
    const checklist = (await safeSelect('portal_handover_checklist', { project_id: req.params.projectId }))[0] || null;
    const snags = await safeSelect('portal_snag_items', { project_id: req.params.projectId });
    const defaultChecklist = {
      'Structural completion': 'Pending',
      'Electrical testing': 'Pending',
      'Plumbing testing': 'Pending',
      'Doors/windows inspection': 'Pending',
      'Documents received': docs.length ? 'Completed' : 'Pending',
      'Warranties received': 'Pending',
      'Final payment completed': 'Pending',
      'Keys handed over': 'Pending',
    };
    res.json({
      success: true,
      data: {
        documents: docs,
        checklist: checklist || { items: defaultChecklist },
        checklist_items: checklist?.items || defaultChecklist,
        snags,
      },
    });
  } catch (err) { next(err); }
});

// ── Maintenance ───────────────────────────────────────────
router.get('/projects/:projectId/maintenance', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const rows = await safeSelect('portal_maintenance_requests', { project_id: req.params.projectId });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/projects/:projectId/maintenance', async (req, res, next) => {
  try {
    const project = await getOwnedProject(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const row = {
      id: crypto.randomUUID(),
      project_id: req.params.projectId,
      user_id: req.user.id,
      category: req.body.category || 'Other',
      description: req.body.description || '',
      priority: req.body.priority || 'normal',
      status: 'open',
    };
    const { data, error } = await supabase.from('portal_maintenance_requests').insert(row).select().maybeSingle();
    if (error && isDbMissing(error)) {
      const ctx = project.construction_context || {};
      ctx.maintenance = [...(ctx.maintenance || []), row];
      projectStore.updateMemoryProject(req.params.projectId, req.user.id, { construction_context: ctx });
      return res.json({ success: true, data: row });
    }
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Support tickets ───────────────────────────────────────
router.get('/support-tickets', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('portal_support_tickets').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error && isDbMissing(error)) return res.json({ success: true, data: [] });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) { next(err); }
});

router.post('/support-tickets', async (req, res, next) => {
  try {
    const row = {
      id: crypto.randomUUID(),
      project_id: req.body.project_id || null,
      user_id: req.user.id,
      category: req.body.category || 'general',
      subject: req.body.subject || 'Support request',
      description: req.body.description || '',
      priority: req.body.priority || 'normal',
      status: 'open',
    };
    const { data, error } = await supabase.from('portal_support_tickets').insert(row).select().maybeSingle();
    if (error && isDbMissing(error)) return res.json({ success: true, data: row });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.WORKFLOW_STEPS = WORKFLOW_STEPS;
