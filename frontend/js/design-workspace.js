// OH I SEE — Shared Design & Engineering workspace (Step 4)
(function (root) {
  'use strict';

  function apiBase() {
    if (typeof resolveOhiseeApiBase === 'function') return resolveOhiseeApiBase();
    return (location.port === '3000' || location.port === '5173') ? '/api' : 'http://127.0.0.1:3001/api';
  }

  function authToken() {
    return typeof TokenStore !== 'undefined' ? TokenStore.get()
      : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));
  }

  function workflowUrl(step, projectId) {
    const params = new URLSearchParams({ view: 'workflow', step: String(step) });
    if (projectId) params.set('projectId', projectId);
    return `customer-portal.html?${params}`;
  }

  function parseDraft() {
    try {
      return JSON.parse(localStorage.getItem('ohisee_dream_home_draft') || 'null');
    } catch {
      return null;
    }
  }

  function buildContextFromParts(data, constructionContext) {
    const ctx = constructionContext || {};
    const setup = ctx.projectSetup || data?.projectSetup || {};
    const land = ctx.landSite || data?.landSite || {};
    let requirements = {};
    if (typeof RequirementsStep !== 'undefined') {
      requirements = RequirementsStep.defaults(setup, land);
      Object.assign(requirements, ctx.intentAnswers || ctx.projectRequirements || data?.requirements || {});
    }
    const reqHash = typeof RequirementsStepModel !== 'undefined'
      ? RequirementsStepModel.requirementsHash(requirements) : '';
    let designState = ctx.designEngineering || {};
    if (typeof DesignEngineeringStep !== 'undefined') {
      designState = { ...DesignEngineeringStep.defaults({ requirements, requirements_hash: reqHash }), ...designState };
    }
    if (designState.requirements_hash && reqHash && designState.requirements_hash !== reqHash) {
      designState.requirements_stale = true;
    }
    designState.requirements_hash = reqHash;
    return {
      setup,
      land,
      requirements,
      designState,
      bimStatus: data?.bim_status || data?.bim_generation_status || 'none',
    };
  }

  function loadContextFromDraft(pid) {
    const draft = parseDraft();
    const ws = typeof PortalWorkflow !== 'undefined' ? PortalWorkflow.getWizardState?.() : null;
    const setup = ws?.setupState || draft?.projectSetup || draft?.answers?.projectSetup || {
      project_name: 'My Project',
      project_type: 'Residential House',
    };
    const land = ws?.landSiteState || draft?.landSite || draft?.answers?.landSite || {};
    const requirements = ws?.requirementsState || draft?.requirements || {};
    const ctx = {
      projectSetup: {
        project_name: setup.project_name || 'My Project',
        project_type: setup.project_type || 'Residential House',
        ...setup,
      },
      landSite: land,
      intentAnswers: requirements,
      designEngineering: {},
    };
    return buildContextFromParts({}, ctx);
  }

  async function fetchProjectRecord(pid) {
    const resp = await fetch(`${apiBase()}/projects/${encodeURIComponent(pid)}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    if (!resp.ok) return null;
    const result = await resp.json().catch(() => ({}));
    return result.data || result;
  }

  async function loadProjectContext(pid) {
    let data = null;
    try {
      const res = await PortalAPI.getSummary(pid);
      data = res.data || {};
    } catch {
      data = await fetchProjectRecord(pid);
    }
    if (data && (data.project_id || data.project_name || data.construction_context)) {
      return buildContextFromParts(data, data.construction_context || {});
    }
    const draftCtx = loadContextFromDraft(pid);
    if (draftCtx) return draftCtx;
    return buildContextFromParts({ project_id: pid }, {
      projectSetup: { project_name: 'New Project', project_type: 'Residential House' },
    });
  }

  async function saveDesignState(pid, designState, versions) {
    return PortalAPI.saveDesignState(pid, {
      ...designState,
      design_versions_count: versions?.length || 0,
      requirements_hash: designState.requirements_hash,
    });
  }

  /**
   * Mount full Design & Engineering UI into container.
   * @param {HTMLElement} el
   * @param {{ projectId: string, onPrevious?: Function, onComplete?: Function, previousHref?: string }} options
   */
  async function mount(el, options = {}) {
    const pid = options.projectId;
    if (!el) return;
    if (!pid) {
      el.innerHTML = '<div class="cp-empty"><p>Save Project Setup first to generate designs.</p></div>';
      return;
    }
    if (typeof DesignEngineeringStep === 'undefined' || typeof PortalAPI === 'undefined') {
      el.innerHTML = '<div class="cp-empty"><p>Design scripts failed to load. Hard refresh the page (Ctrl+Shift+R).</p></div>';
      return;
    }

    el.innerHTML = '<div class="cp-loading">Loading design workspace...</div>';

    let ctx;
    let versions = [];
    let validationErrors = {};
    let designState;

    try {
      ctx = await loadProjectContext(pid);
      designState = ctx.designState;
    } catch (err) {
      const prevHref = options.previousHref || workflowUrl(3, pid);
      el.innerHTML = `
        <div class="cp-wizard-embed dh-wizard-card">
          <div class="cp-empty"><p>${err.message || 'Could not load design workspace.'}</p></div>
          <div class="form-actions dh-nav-footer">
            <a class="form-actions__prev form-actions__prev--link" href="${prevHref}">\u2190 Previous</a>
            <a class="form-actions__next form-actions__next--link" href="customer-portal.html?view=projects">My Projects</a>
          </div>
        </div>`;
      return;
    }

    try {
      const designsResp = await PortalAPI.getDesigns(pid);
      versions = designsResp.data || [];
    } catch {
      versions = [];
    }
    if (!designState.selected_version_id && versions.length) {
      const current = versions.find((v) => v.status === 'Current' || v.status === 'current') || versions[versions.length - 1];
      designState.selected_version_id = current?.id || '';
    }

    const showErr = (msg) => {
      const box = el.querySelector('#de-wizard-err');
      if (box) {
        box.textContent = msg; box.hidden = !msg; box.setAttribute('role', 'alert');
        if (msg) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    const prevControl = options.previousHref
      ? `<a class="form-actions__prev form-actions__prev--link" href="${options.previousHref}">\u2190 Previous</a>`
      : `<button type="button" class="form-actions__prev" id="de-prev">\u2190 Previous</button>`;

    const paint = () => {
      el.innerHTML = `
        <div id="de-wizard-err" class="dh-err" hidden></div>
        <div class="dh-wizard-body" id="de-form-mount">
          ${DesignEngineeringStep.renderForm(designState, versions, validationErrors, ctx.bimStatus)}
        </div>
        <div class="form-actions dh-nav-footer">
          ${prevControl}
          <button type="button" class="form-actions__draft" id="de-save-draft">Save as Draft</button>
          <button type="button" class="form-actions__next" id="de-next">Next: Builder Quotes \u2192</button>
        </div>`;

      const mount = el.querySelector('#de-form-mount');
      DesignEngineeringStep.bindForm(mount, designState, {
        onChange: (s) => { designState = s; },
        onGenerate: () => handleGenerate(),
        onRegenerate: () => handleGenerate(true),
        onRequestChanges: () => handleRequestChanges(),
        onFiles: (files) => handleFiles(files),
        onRemoveDoc: (idx) => {
          designState.design_documents.splice(idx, 1);
          paint();
        },
      });

      el.querySelector('#de-prev')?.addEventListener('click', () => options.onPrevious?.());
      el.querySelector('#de-save-draft')?.addEventListener('click', () => handleSaveDraft());
      el.querySelector('#de-next')?.addEventListener('click', () => handleNext());
    };

    async function handleGenerate(regenerate = false) {
      const form = el.querySelector('#design-engineering-form');
      if (form) designState = DesignEngineeringStep.readFormState(form, designState);
      if (!designState.packages?.length) {
        validationErrors = { packages: 'Select at least one design package.' };
        paint();
        showErr('Select at least one design package.');
        return;
      }
      showErr('');
      const btn = el.querySelector('#de-generate');
      const btnLabel = btn?.querySelector('.de-generate-label');
      if (btn) {
        btn.disabled = true;
        if (btnLabel) btnLabel.textContent = 'Generating...';
      }
      try {
        await PortalAPI.createDesignVersion(pid, {
          packages: designState.packages,
          preferences: designState.preferences,
        });
        const payload = DesignEngineeringStep.buildBimPayload(pid, ctx.setup, ctx.land, ctx.requirements, designState);
        const generationResp = await fetch(`${apiBase()}/projects/${encodeURIComponent(pid)}/bim/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
          body: JSON.stringify(payload),
        });
        const generation = await generationResp.json().catch(() => ({}));
        if (!generationResp.ok || generation.success === false) {
          throw new Error(generation.error || 'Design generation failed. Please retry.');
        }
        ctx.bimStatus = generation.data?.status || 'generated';
        if (regenerate) designState.requirements_stale = false;
        designState.requirements_hash = typeof RequirementsStepModel !== 'undefined'
          ? RequirementsStepModel.requirementsHash(ctx.requirements) : designState.requirements_hash;
        await saveDesignState(pid, designState, versions);
        const designsResp = await PortalAPI.getDesigns(pid);
        versions = designsResp.data || [];
        if (versions.length) {
          designState.selected_version_id = versions[versions.length - 1].id;
        }
        validationErrors = {};
        paint();
        if (typeof PortalSummary !== 'undefined') PortalSummary.refresh();
      } catch (e) {
        showErr(e.message || 'Design generation failed.');
      } finally {
        const b = el.querySelector('#de-generate');
        const bLabel = b?.querySelector('.de-generate-label');
        if (b) {
          b.disabled = false;
          if (bLabel) bLabel.textContent = 'Generate Design Options';
        }
      }
    }

    async function handleRequestChanges() {
      const form = el.querySelector('#design-engineering-form');
      if (form) designState = DesignEngineeringStep.readFormState(form, designState);
      designState.approval_status = 'Changes Requested';
      try {
        await PortalAPI.approveDesign(pid, {
          version_id: designState.selected_version_id,
          approval_status: 'Changes Requested',
          approval_date: designState.approval_date,
          comments: designState.approval_comments,
        });
        await saveDesignState(pid, designState, versions);
        showErr('Changes requested. Design sent back to the design workflow.');
        paint();
      } catch (e) { showErr(e.message); }
    }

    function handleFiles(fileList) {
      if (!fileList?.length) return;
      designState.design_documents = designState.design_documents || [];
      for (const file of fileList) {
        if (file.size > 25 * 1024 * 1024) { showErr('File too large (max 25 MB).'); continue; }
        designState.design_documents.push({
          file_name: file.name, file_size: file.size, mime_type: file.type, status: 'uploaded',
        });
      }
      paint();
    }

    async function handleSaveDraft() {
      const form = el.querySelector('#design-engineering-form');
      if (form) designState = DesignEngineeringStep.readFormState(form, designState);
      try {
        await saveDesignState(pid, designState, versions);
        if (typeof PortalAPI !== 'undefined' && PortalAPI.saveDraft) {
          await PortalAPI.saveDraft(pid, {
            workflow_step: 4,
            wizardStep: 4,
            designEngineering: designState,
          });
        }
        try { sessionStorage.setItem('ohisee_active_draft_project_id', pid); } catch { /* ignore */ }
        if (typeof PortalApp?.setSaveStatus === 'function') PortalApp.setSaveStatus('saved');
      } catch (e) {
        showErr(e.message);
        if (typeof PortalApp?.setSaveStatus === 'function') {
          PortalApp.setSaveStatus('error', e.message || '⚠ Unable to save draft');
        }
      }
    }

    async function handleNext() {
      const form = el.querySelector('#design-engineering-form');
      if (form) designState = DesignEngineeringStep.readFormState(form, designState);
      const result = DesignEngineeringStep.validate(designState, versions);
      if (!result.valid) {
        validationErrors = result.errors;
        paint();
        showErr(Object.values(result.errors).join(' '));
        return;
      }
      if (designState.requirements_stale) {
        showErr('Your requirements have changed. Regenerate design or keep existing design before continuing.');
        return;
      }
      try {
        if (designState.selected_version_id || designState.approval_status) {
          await PortalAPI.approveDesign(pid, {
            version_id: designState.selected_version_id || null,
            approval_status: designState.approval_status || 'Pending',
            approval_date: designState.approval_date || new Date().toISOString().slice(0, 10),
            comments: designState.approval_comments || '',
          }).catch(() => {});
        }
        await saveDesignState(pid, designState, versions);
        await PortalAPI.updateWorkflow(pid, 5);
        if (options.onComplete) {
          options.onComplete(pid);
        } else {
          window.location.href = workflowUrl(5, pid);
        }
      } catch (e) { showErr(e.message); }
    }

    paint();
    if (typeof PortalSummary !== 'undefined') {
      PortalSummary.refresh();
    }
  }

  root.DesignWorkspace = { mount, loadProjectContext, workflowUrl };
})(typeof window !== 'undefined' ? window : global);
