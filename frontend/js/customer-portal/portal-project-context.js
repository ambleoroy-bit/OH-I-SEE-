// OH I SEE — Customer Portal project context & section access
(function (root) {
  'use strict';

  const ACTIVE_KEY = 'ohisee_active_draft_project_id';

  const SECTION_META = {
    quotes: { minStep: 5, label: 'Builder Quotes', unlock: 'Design & Engineering approval' },
    materials: { minStep: 7, label: 'Material Orders', unlock: 'builder selection and project execution' },
    payments: { minStep: 6, label: 'Payments', unlock: 'builder selection' },
    messages: { minStep: 5, label: 'Messages', unlock: 'design completion' },
    'site-updates': { minStep: 7, label: 'Site Updates', unlock: 'project execution begins' },
    handover: { minStep: 8, label: 'Handover Documents', unlock: 'project reaches handover stage' },
  };

  function resolveProjectId(explicit) {
    if (explicit) return explicit;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('projectId');
      if (fromUrl) return fromUrl;
    } catch { /* ignore */ }
    try {
      const stored = sessionStorage.getItem(ACTIVE_KEY);
      if (stored) return stored;
    } catch { /* ignore */ }
    return root._ohiseeLinkedProjectId
      || (typeof PortalWorkflow !== 'undefined' ? PortalWorkflow.getProjectId?.() : null)
      || null;
  }

  function persistProjectId(projectId) {
    if (!projectId) return;
    root._ohiseeLinkedProjectId = projectId;
    try { sessionStorage.setItem(ACTIVE_KEY, projectId); } catch { /* ignore */ }
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.get('projectId')) {
        u.searchParams.set('projectId', projectId);
        window.history.replaceState({}, '', u);
      }
    } catch { /* ignore */ }
  }

  async function loadProject(projectId) {
    if (!projectId) return { ok: false, code: 'no_project' };
    try {
      const { data } = await PortalAPI.getSummary(projectId);
      persistProjectId(projectId);
      return { ok: true, project: data, projectId };
    } catch (err) {
      const msg = String(err.message || '');
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        return { ok: false, code: 'not_found', message: 'Project not found.' };
      }
      if (msg.includes('403') || msg.toLowerCase().includes('permission')) {
        return { ok: false, code: 'forbidden', message: "You don't have permission to view this project." };
      }
      return { ok: false, code: 'error', message: msg || 'Could not load project.' };
    }
  }

  function workflowStep(project) {
    return Math.min(8, Math.max(1, parseInt(project?.workflow_step || 1, 10) || 1));
  }

  function quoteStatus(project, quotes = [], selections = []) {
    const selected = selections.find((s) => s.status === 'selected' || s.status === 'confirmed');
    if (selected?.status === 'confirmed' || String(project?.status || '').includes('builder')) {
      return 'Builder Selected';
    }
    if (selected) return 'Quotes Under Review';
    if (quotes.length) return 'Quotes Received';
    const step = workflowStep(project);
    if (step >= 5) return 'Awaiting Builders';
    return 'Not Submitted';
  }

  function sectionAccess(project, sectionId) {
    const meta = SECTION_META[sectionId];
    if (!meta) return { available: true };
    const step = workflowStep(project);
    const status = String(project?.status || 'draft').toLowerCase();
    if (sectionId === 'quotes' && (step >= 5 || ['design_generated', 'awaiting_builder'].includes(status))) {
      return { available: true };
    }
    if (sectionId === 'messages' && step >= 5) return { available: true };
    if (sectionId === 'payments' && (step >= 6 || project?.selected_builder)) return { available: true };
    if (sectionId === 'materials' && (step >= 7 || ['builder_selected', 'in_execution'].includes(status))) {
      return { available: true };
    }
    if (sectionId === 'site-updates' && (step >= 7 || status === 'in_execution')) return { available: true };
    if (sectionId === 'handover' && (step >= 8 || status === 'completed')) return { available: true };
    if (step >= meta.minStep) return { available: true };
    return {
      available: false,
      locked: true,
      message: `Available after ${meta.unlock}.`,
      unlockStep: meta.minStep,
    };
  }

  function noProjectHtml() {
    return `<div class="cp-empty cp-empty-action">
      <p>Select a project from My Projects to view this section.</p>
      <a class="cp-btn cp-btn-primary" href="customer-portal.html?view=projects">My Projects</a>
    </div>`;
  }

  function lockedHtml(access, projectId) {
    const step = access.unlockStep || 1;
    const stage = access.message?.replace(/^Available after\s*/i, '') || 'earlier project stages';
    return `<div class="cp-empty cp-section-locked">
      <div class="cp-lock-icon" aria-hidden="true">&#128274;</div>
      <h2>Available after ${stage}</h2>
      <p>Complete the required workflow steps to unlock this section.</p>
      <a class="cp-btn cp-btn-primary" href="customer-portal.html?view=workflow&step=${step}&projectId=${encodeURIComponent(projectId)}">Continue Project</a>
    </div>`;
  }

  root.PortalProjectContext = {
    resolveProjectId,
    persistProjectId,
    loadProject,
    workflowStep,
    quoteStatus,
    sectionAccess,
    noProjectHtml,
    lockedHtml,
    SECTION_META,
  };
})(typeof window !== 'undefined' ? window : global);
