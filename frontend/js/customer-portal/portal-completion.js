// OH I SEE — Unified project completion calculator (Customer Portal)
(function (root) {
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
    if (root.ProjectSetupModel?.completionStats) {
      return root.ProjectSetupModel.completionStats(ps).percentage;
    }
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
        if (req[k] !== '' && req[k] !== null && req[k] !== undefined) done += 1;
      } else if (filled(req[k])) done += 1;
    }
    return pct(done, REQ_FIELDS.length);
  }

  function stepFieldCompletion(workflowStep, ctx = {}) {
    const step = Math.min(8, Math.max(1, parseInt(workflowStep, 10) || 1));
    if (step === 1) return setupCompletion(ctx.projectSetup || ctx.setupState || {});
    if (step === 2) return landCompletion(ctx.landSite || ctx.landSiteState || {});
    if (step === 3) {
      const req = ctx.requirements || ctx.intentAnswers || ctx.projectRequirements || ctx.requirementsState || {};
      return requirementsCompletion(req);
    }
    return Math.round((step / 8) * 100);
  }

  function projectCompletionPercent(options = {}) {
    const workflowStep = Math.min(8, Math.max(1, parseInt(options.workflowStep || options.workflow_step || 1, 10) || 1));
    const ctx = {
      projectSetup: options.setupState || options.projectSetup,
      landSite: options.landSiteState || options.landSite,
      requirements: options.requirementsState || options.requirements,
      intentAnswers: options.requirementsState || options.requirements,
    };

    const stepPct = stepFieldCompletion(workflowStep, ctx) / 100;
    const prior = Math.max(0, workflowStep - 1);
    return Math.min(100, Math.round(((prior + stepPct) / 8) * 100));
  }

  function formatRelativeTime(iso) {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minute${Math.floor(diff / 60000) === 1 ? '' : 's'} ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hour${Math.floor(diff / 3600000) === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  root.PortalCompletion = {
    setupCompletion,
    landCompletion,
    requirementsCompletion,
    stepFieldCompletion,
    projectCompletionPercent,
    formatRelativeTime,
  };
})(typeof window !== 'undefined' ? window : global);
