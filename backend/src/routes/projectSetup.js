'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');
const storage = require('../services/design3d/storage');
const projectStore = require('../services/projectMemoryStore');
const { projectCompletionPercent } = require('../services/portalCompletion');
const { generateUniqueProjectId } = require('../services/projectMemoryStore');

const roomModel = require('../../../frontend/js/requirements-step-model');
const router = express.Router();
router.use(authenticate);

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.dwg', '.dxf'];

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function validateDocument(file) {
  if (!file?.name || !file?.data) fail('Invalid document payload.');
  const ext = '.' + String(file.name).split('.').pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) fail(`Unsupported file type: ${file.name}`);
  const bytes = Buffer.from(file.data, 'base64');
  if (bytes.length > MAX_FILE_BYTES) fail(`${file.name} exceeds 25 MB limit.`);
  return { bytes, name: file.name, mime: file.mime_type || 'application/octet-stream', document_type: file.document_type || 'other' };
}

function setupToRow(body, userId, existing = null) {
  const ps = body.construction_context?.projectSetup || body.projectSetup || {};
  const features = ps.features || {};
  const ctx = {
    ...(existing?.construction_context || {}),
    projectSetup: ps,
    setupCompleted: !!body.construction_context?.setupCompleted,
    intentType: body.intent_type || existing?.intent_type || 'NEW_HOME',
  };

  const floorsMap = {
    'Ground Floor Only': 1, 'G + 1': 2, 'G + 2': 3, 'G + 3': 4, 'G + 4': 5, '5+ Floors': 5,
  };

  return {
    project_name: body.project_name || ps.project_name || 'Untitled Project',
    project_type: body.project_type || ps.project_type || 'Residential House',
    description: body.description || ps.description || '',
    state: body.state || ps.state || '',
    city: body.city || ps.city || '',
    location: body.location || `${ps.city || ''}, ${ps.state || ''}`.trim(),
    built_up_area: body.built_up_area || (ps.built_up_area ? `${ps.built_up_area} sq.ft` : ''),
    floors: body.floors || floorsMap[ps.floors] || 1,
    budget: body.budget ?? (ps.estimated_budget ? parseFloat(String(ps.estimated_budget).replace(/[^\d.]/g, '')) : 0),
    estimated_cost: body.estimated_cost ?? body.budget ?? 0,
    intent_type: body.intent_type || 'NEW_HOME',
    current_stage: body.current_stage || 'Project Setup',
    status: body.status || 'draft',
    construction_context: ctx,
    client_name: ps.owner_name || body.client_name || '',
  };
}

async function saveDocuments(projectId, userId, documents, existingDocs = []) {
  const saved = [...existingDocs];
  for (const doc of documents || []) {
    const { bytes, name, mime, document_type } = validateDocument(doc);
    const key = `${userId}/${projectId}/documents/${crypto.randomUUID()}/${name}`;
    await storage.put(key, bytes, mime);
    const meta = {
      id: crypto.randomUUID(),
      project_id: projectId,
      document_type,
      file_name: name,
      storage_path: key,
      file_size: bytes.length,
      mime_type: mime,
      is_required: document_type === 'land_ownership',
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId,
    };
    saved.push(meta);
    try {
      await supabase.from('project_documents').insert({
        project_id: projectId,
        document_type: meta.document_type,
        file_name: meta.file_name,
        storage_path: meta.storage_path,
        file_size: meta.file_size,
        mime_type: meta.mime_type,
        is_required: meta.is_required,
        uploaded_by: userId,
      });
    } catch {
      /* table may not exist — metadata kept in construction_context */
    }
  }
  return saved;
}

async function createOrUpdate(req, res, existing = null) {
  const userId = req.user.id;
  const row = setupToRow(req.body, userId, existing);
  let projectId = existing?.project_id;

  const isDraft = req.body.draft === true || row.status === 'draft';
  const workflowStep = Math.min(8, Math.max(1, parseInt(req.body.workflow_step || req.body.wizardStep || 1, 10)));
  const now = new Date().toISOString();
  row.workflow_step = workflowStep;
  row.status = isDraft ? 'draft' : (row.status || 'active');
  row.last_saved_at = now;
  row.completion_percentage = projectCompletionPercent({
    ...existing,
    status: row.status,
    workflow_step: workflowStep,
    construction_context: row.construction_context,
  });
  row.workflow_progress = row.completion_percentage;

  if (!existing) {
    projectId = generateUniqueProjectId();
    const insertRow = {
      ...row,
      project_id: projectId,
      user_id: userId,
      acceptance_status: 'pending_vendor',
    };
    const { data, error } = await supabase.from('projects').insert(insertRow).select('*').single();
    if (error && projectStore.isProjectsDbUnavailable(error)) {
      const mem = projectStore.saveMemoryProject({ ...insertRow, id: crypto.randomUUID() });
      return res.status(201).json({ data: mem });
    }
    if (error) fail(error.message, 503);
    existing = data || { ...insertRow, project_id: projectId, construction_context: row.construction_context };
  } else {
    if (!isDraft) row.acceptance_status = 'pending_vendor';
    const { data, error } = await supabase.from('projects')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error && projectStore.isProjectsDbUnavailable(error)) {
      const mem = projectStore.updateMemoryProject(projectId, userId, row);
      return res.json({ data: mem });
    }
    if (error) fail(error.message, 503);
    existing = data;
  }

  const prevDocs = existing?.construction_context?.documents || [];
  const newDocs = await saveDocuments(projectId, userId, req.body.documents, prevDocs);
  const ctx = { ...(existing?.construction_context || {}), documents: newDocs };
  await supabase.from('projects')
    .update({ construction_context: ctx })
    .eq('project_id', projectId)
    .eq('user_id', userId);

  res.status(existing.created_at === existing.updated_at ? 201 : 200).json({
    data: { ...existing, construction_context: ctx },
    project_id: projectId,
  });
}

router.post('/setup', async (req, res, next) => {
  try {
    await createOrUpdate(req, res, null);
  } catch (e) { next(e); }
});

router.put('/:projectId/setup', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('projects')
      .select('*')
      .eq('project_id', req.params.projectId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error && !projectStore.isProjectsDbUnavailable(error)) fail('Project storage unavailable.', 503);
    const existing = data || projectStore.findMemoryProject(req.params.projectId, req.user.id);
    if (!existing) fail('Project not found.', 404);
    await createOrUpdate(req, res, existing);
  } catch (e) { next(e); }
});

/** Merge wizard step data (land site, requirements) into existing project */
router.put('/:projectId/wizard', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const projectId = req.params.projectId;
    const { data, error } = await supabase.from('projects')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    let existing = data;
    if (error && projectStore.isProjectsDbUnavailable(error)) {
      existing = projectStore.findMemoryProject(projectId, userId);
    } else if (error) fail('Project storage unavailable.', 503);
    if (!existing) fail('Project not found.', 404);

    const ctx = { ...(existing.construction_context || {}) };
    if (req.body.projectSetup) ctx.projectSetup = req.body.projectSetup;
    if (req.body.landSite) ctx.landSite = req.body.landSite;
    if (req.body.requirements) {
      ctx.intentAnswers = req.body.requirements;
      ctx.projectRequirements = req.body.requirements;
      ctx.requirementsPublished = !!req.body.publish;
      if (req.body.publish) ctx.requirementsStatus = 'SUBMITTED';
    }
    if (req.body.wizardStep) ctx.wizardStep = req.body.wizardStep;

    const ls = req.body.landSite || ctx.landSite || {};
    const floorsMap = {
      'Ground Floor Only': 1, 'G + 1 Floor': 2, 'G + 2 Floors': 3, 'G + 3 Floors': 4,
    };
    const reqAnswers = req.body.requirements || ctx.intentAnswers || {};
    if (req.body.publish || (Number(req.body.wizardStep || req.body.workflow_step) > 3 && !req.body.draft)) {
      const area = roomModel.areaValidation(reqAnswers, ls);
      if (Object.keys(area.errors).length) fail(Object.values(area.errors).join(' '));
    }
    const bedsMap = { '1 Bedroom': 1, '2 Bedrooms': 2, '3 Bedrooms': 3, '4 Bedrooms': 4, '5+ Bedrooms': 5 };
    const parkMap = { 'No Parking': 0, '1 Car': 1, '2 Cars': 2, '3+ Cars': 3 };

    const workflowStep = Math.min(8, Math.max(1, parseInt(req.body.wizardStep || req.body.workflow_step || existing.workflow_step || 1, 10)));
    const isDraft = req.body.draft === true || (!req.body.publish && String(existing.status || '').toLowerCase() === 'draft');
    const now = new Date().toISOString();
    ctx.wizardStep = workflowStep;

    const ps = ctx.projectSetup || {};
    const patch = {
      construction_context: ctx,
      current_stage: req.body.current_stage || existing.current_stage,
      workflow_step: workflowStep,
      status: req.body.publish ? (existing.status === 'draft' ? 'active' : existing.status) : (isDraft ? 'draft' : existing.status),
      last_saved_at: now,
      updated_at: now,
    };
    if (ps.city) patch.city = ps.city;
    if (ps.state) patch.state = ps.state;
    if (ps.city || ps.state) patch.location = `${ps.city || ''}, ${ps.state || ''}`.trim();
    if (req.body.publish || !isDraft) patch.acceptance_status = 'pending_vendor';
    patch.completion_percentage = projectCompletionPercent({ ...existing, ...patch, construction_context: ctx });
    patch.workflow_progress = patch.completion_percentage;
    if (ls.plot_length_ft) patch.plot_length = parseFloat(ls.plot_length_ft);
    if (ls.plot_width_ft) patch.plot_width = parseFloat(ls.plot_width_ft);
    if (ls.road_facing) patch.road_facing = ls.road_facing;
    if (ls.plot_length_ft && ls.plot_width_ft) {
      patch.plot_size = `${ls.plot_length_ft} x ${ls.plot_width_ft} ft`;
    }
    if (reqAnswers.floors) patch.floors = roomModel.floorCount(reqAnswers.floors);
    if (reqAnswers.built_up_area) patch.built_up_area = String(reqAnswers.built_up_area) + ' sq.ft';
    if (reqAnswers.bedrooms) patch.bedrooms = bedsMap[reqAnswers.bedrooms] || existing.bedrooms;
    if (reqAnswers.bathrooms) patch.bathrooms = parseInt(reqAnswers.bathrooms, 10) || existing.bathrooms;
    if (reqAnswers.parking) patch.parking_count = parkMap[reqAnswers.parking] ?? existing.parking_count;
    if (reqAnswers.arch_style) patch.architectural_style = reqAnswers.arch_style;
    if (reqAnswers.has_pooja) patch.has_pooja = reqAnswers.has_pooja === 'Yes';
    if (reqAnswers.has_office) patch.has_office = reqAnswers.has_office === 'Yes';
    if (reqAnswers.has_terrace) patch.has_terrace = reqAnswers.has_terrace === 'Yes';

    const { data: updated, error: upErr } = await supabase.from('projects')
      .update(patch)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (upErr && projectStore.isProjectsDbUnavailable(upErr)) {
      const mem = projectStore.updateMemoryProject(projectId, userId, patch);
      return res.json({ data: mem, project_id: projectId });
    }
    if (upErr) fail(upErr.message, 503);
    res.json({ data: updated, project_id: projectId });
  } catch (e) { next(e); }
});

module.exports = router;
