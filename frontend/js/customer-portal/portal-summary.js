// OH I SEE — Live project summary (right panel: home image + completion bar)
(function (root) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  const DRAFT_KEY = 'ohisee_dream_home_draft';
  const STEPS_TOTAL = 8;

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function fmtDate(d) {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  }

  function fmtINR(val) {
    const PM = root.ProjectSetupModel;
    if (PM && val) return PM.formatINR(PM.parseINR(val));
    const n = parseFloat(String(val).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return `\u20B9${n.toLocaleString('en-IN')}`;
  }

  function resolveState(options = {}) {
    const draft = loadDraft();
    let setup = options.setupState || draft?.projectSetup || draft?.answers?.projectSetup || null;
    let land = options.landSiteState || draft?.landSite || draft?.answers?.landSite || null;
    let requirements = options.requirementsState || draft?.requirements || null;
    let workflowStep = options.workflowStep || draft?.currentStep || 1;
    const projectId = options.projectId || draft?.projectId || root._ohiseeLinkedProjectId || null;

    if (typeof PortalWorkflow !== 'undefined' && PortalWorkflow.getWizardState) {
      const ws = PortalWorkflow.getWizardState();
      if (ws) {
        setup = ws.setupState || setup;
        land = ws.landSiteState || land;
        requirements = ws.requirementsState || requirements;
        if (ws.currentStep) workflowStep = ws.currentStep;
      }
    }

    const app = root.CustomerPortalApp?.getState?.();
    if (app?.workflowStep) workflowStep = app.workflowStep;

    return { setup, land, requirements, workflowStep, projectId };
  }

  function buildRows(setup, land, requirements) {
    const PM = root.ProjectSetupModel;
    const s = setup || {};
    const ls = land || {};
    const plot = ls.plot_length_ft && ls.plot_width_ft
      ? `${ls.plot_width_ft} \u00D7 ${ls.plot_length_ft} ft`
      : (s.built_up_area ? `${Number(s.built_up_area).toLocaleString('en-IN')} sq.ft built-up` : 'Plot size');
    const budget = fmtINR(s.estimated_budget);

    const rows = [
      { icon: '\uD83C\uDFE0', text: s.project_name || 'Project name', on: !!s.project_name },
      { icon: '\uD83C\uDFD7', text: s.project_type || 'Project type', on: !!s.project_type },
      { icon: '\uD83C\uDFE2', text: s.floors || 'Floors', on: !!s.floors },
      { icon: '\uD83D\uDCD0', text: plot, on: !!(ls.plot_length_ft || s.built_up_area) },
      { icon: '\uD83D\uDCCD', text: s.city && s.state ? `${s.city}, ${s.state}` : 'Location', on: !!(s.city && s.state) },
      { icon: '\uD83E\uDDED', text: ls.road_facing ? `Facing: ${ls.road_facing}` : (s.facing_direction ? `Facing: ${s.facing_direction}` : 'Facing'), on: !!(ls.road_facing || s.facing_direction) },
      { icon: '\uD83D\uDCB0', text: budget ? `Budget: ${budget}` : 'Budget', on: !!budget },
      { icon: '\uD83D\uDCC5', text: s.start_date ? `Start: ${fmtDate(s.start_date)}` : 'Start date', on: !!s.start_date },
      { icon: '\uD83D\uDCC5', text: s.target_completion_date ? `Target: ${fmtDate(s.target_completion_date)}` : 'Target date', on: !!s.target_completion_date },
    ];

    const beds = requirements?.bedrooms
      || (requirements?.qty_bedrooms ? `${requirements.qty_bedrooms} Bedroom${parseInt(requirements.qty_bedrooms, 10) > 1 ? 's' : ''}` : null);
    if (beds) {
      rows.push({ icon: '\uD83D\uDECF\uFE0F', text: beds, on: true });
    }

    return rows;
  }

  function completion(setup, workflowStep, land, requirements) {
    const PM = root.ProjectSetupModel;
    const stats = PM && setup ? PM.completionStats(setup) : { percentage: 0, requiredDone: 0, requiredTotal: 17 };
    const PC = root.PortalCompletion;
    const combined = PC
      ? PC.projectCompletionPercent({
        workflowStep,
        status: 'draft',
        setupState: setup,
        landSiteState: land,
        requirementsState: requirements,
      })
      : Math.round((workflowStep / STEPS_TOTAL) * 100);
    return { combined, stats, workflowStep, stepPct: combined };
  }

  function tiersFromFloors(floors) {
    const map = { 'Ground Floor Only': 1, 'G + 1': 2, 'G + 2': 3, 'G + 3': 4, 'G + 4': 5, '5+ Floors': 5 };
    return map[floors] || 1;
  }

  function renderHtml(options = {}) {
    const { setup, land, requirements, workflowStep } = resolveState(options);
    const rows = buildRows(setup, land, requirements);
    const { combined, stats } = completion(setup, workflowStep, land, requirements);
    const tiers = tiersFromFloors(setup?.floors);

    return `
      <div class="dream-summary-panel cp-live-summary">
        <div class="dream-summary-head">
          <div class="summary-panel-title">YOUR PROJECT</div>
          <div class="dream-summary-live">Live summary</div>
        </div>
        <div class="dream-house-preview" role="img" aria-label="Your home preview">
          <div class="dh-render dh-tiers-${tiers}">
            <img class="dh-house-img" src="/images/dream-home-preview.jpg" alt="Your home preview" width="280" height="160" loading="lazy">
          </div>
        </div>
        <div class="cp-summary-rows">
          ${rows.map((r) => `
            <div class="dh-row ${r.on ? 'on' : ''}">
              <span class="dh-row-icon">${r.icon}</span>
              <span class="dh-row-text">${esc(r.text)}</span>
            </div>`).join('')}
        </div>
        <div class="cp-readiness-wrap">
          <div class="cp-completion-label">Project completion</div>
          <div class="dh-ready-bar"><div class="dh-ready-fill" style="width:${combined}%"></div></div>
          <div class="dh-ready-pct">${combined}%</div>
          <div class="dh-ready-meta">Step ${workflowStep} of ${STEPS_TOTAL}</div>
        </div>
        <div class="cp-what-next">
          <h4>What happens next?</h4>
          <ol>
            <li>Customer provides requirements</li>
            <li>AI generates design options</li>
            <li>Customer reviews and approves</li>
            <li>Builders receive the project</li>
          </ol>
        </div>
        <p class="dream-quote">"A home is not just a place, it's a better tomorrow."</p>
        <div class="dh-help-box">
          <div class="dh-help-icon">\uD83C\uDFA7</div>
          <div class="dh-help-text">
            <strong>Need help?</strong>
            <p>Talk to a construction expert about your project.</p>
          </div>
          <a href="contact.html" class="dh-expert-btn">Talk to an Expert</a>
        </div>
      </div>`;
  }

  function render(container, options = {}) {
    if (!container) return;
    container.innerHTML = renderHtml(options);
  }

  function refresh() {
    const el = document.getElementById('cp-summary');
    const app = root.CustomerPortalApp?.getState?.();
    if (el) {
      render(el, {
        workflowStep: app?.workflowStep,
        projectId: app?.projectId || root.PortalWorkflow?.getProjectId?.(),
      });
    }
    const intentEl = document.getElementById('dream-project-summary');
    if (intentEl && typeof IntentWizard !== 'undefined') {
      render(intentEl, {
        workflowStep: IntentWizard.getCurrentStep?.() || 1,
        projectId: root._ohiseeLinkedProjectId,
      });
    }
  }

  root.PortalSummary = { render, renderHtml, refresh, resolveState };
})(typeof window !== 'undefined' ? window : global);
