'use strict';

const SETUP_FIELDS = [
  'project_name', 'project_type', 'construction_type', 'description', 'owner_name', 'owner_email',
  'owner_phone', 'ownership_status', 'owner_address', 'site_address', 'state', 'city', 'pincode',
  'floors', 'built_up_area', 'start_date', 'target_completion_date',
];

const LAND_FIELDS = [
  'plot_length_ft', 'plot_width_ft', 'road_facing', 'access_road_type',
  'setback_front_ft', 'setback_rear_ft', 'setback_left_ft', 'setback_right_ft',
];

const REQ_FIELDS = [
  'floors', 'built_up_area', 'construction_type', 'primary_usage', 'project_type',
  'qty_bedrooms', 'qty_bathrooms', 'quality',
];

const OWNERSHIP_DOCS = ['land_ownership', 'sale_deed', 'patta', 'ownership_deed'];

function filled(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') return Number.isFinite(val);
  return String(val).trim().length > 0;
}

function hasOwnershipDoc(documents) {
  return (documents || []).some((d) => OWNERSHIP_DOCS.includes(d.document_type) && d.file_name);
}

function pct(done, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

function setupCompletion(ps = {}) {
  let done = SETUP_FIELDS.filter((k) => filled(ps[k])).length;
  const total = SETUP_FIELDS.length + 1;
  if (hasOwnershipDoc(ps.documents)) done += 1;
  return pct(done, total);
}

function landCompletion(ls = {}) {
  let done = LAND_FIELDS.filter((k) => filled(ls[k])).length;
  const total = LAND_FIELDS.length + 1;
  if (hasOwnershipDoc(ls.documents)) done += 1;
  return pct(done, total);
}

function requirementsCompletion(req = {}) {
  let done = 0;
  for (const k of REQ_FIELDS) {
    if (k.startsWith('qty_')) {
      if (parseInt(req[k], 10) >= 0 && req[k] !== '' && req[k] !== null && req[k] !== undefined) done += 1;
    } else if (filled(req[k])) done += 1;
  }
  return pct(done, REQ_FIELDS.length);
}

function stepFieldCompletion(workflowStep, ctx = {}) {
  const step = Math.min(8, Math.max(1, parseInt(workflowStep, 10) || 1));
  if (step === 1) return setupCompletion(ctx.projectSetup || {});
  if (step === 2) return landCompletion(ctx.landSite || {});
  if (step === 3) return requirementsCompletion(ctx.intentAnswers || ctx.projectRequirements || {});
  return Math.round((step / 8) * 100);
}

function projectCompletionPercent(project = {}) {
  const p = project && typeof project === 'object' ? project : {};
  const ctx = p.construction_context || {};
  const step = p.workflow_step || ctx.wizardStep || 1;
  const status = String(p.status || 'draft').toLowerCase();

  const stepPct = stepFieldCompletion(step, ctx) / 100;
  const prior = Math.max(0, step - 1);
  return Math.min(100, Math.round(((prior + stepPct) / 8) * 100));
}

module.exports = {
  SETUP_FIELDS,
  LAND_FIELDS,
  REQ_FIELDS,
  setupCompletion,
  landCompletion,
  requirementsCompletion,
  stepFieldCompletion,
  projectCompletionPercent,
};
