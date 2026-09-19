// OH I SEE — Embed wizard steps 1–3 inside Customer Portal
(function (root) {
  'use strict';

  const STEPS = [
    'Project Setup', 'Land & Site', 'Requirements',
    'Design & Engineering', 'Builder Quotes', 'Approvals',
    'Project Execution', 'Handover & Maintenance',
  ];
  const DRAFT_KEY = 'ohisee_dream_home_draft';
  const ACTIVE_DRAFT_KEY = 'ohisee_active_draft_project_id';
  const AUTO_SAVE_MS = 800;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

  let mountEl = null;
  let currentStep = 1;
  let projectId = null;
  let setupState = null;
  let landSiteState = null;
  let requirementsState = null;
  let validationErrors = {};
  let pendingFiles = [];
  let landPendingFiles = [];
  let onComplete = null;
  let projectSavedOnServer = false;
  let autoSaveTimer = null;
  let saveInFlight = false;
  let lastServerSaveAt = null;

  function apiBase() {
    if (typeof resolveOhiseeApiBase === 'function') return resolveOhiseeApiBase();
    return (location.port === '3000' || location.port === '5173') ? '/api' : 'http://127.0.0.1:3001/api';
  }

  function getToken() {
    return (typeof TokenStore !== 'undefined' ? TokenStore.get() : null)
      || localStorage.getItem('ohisee_jwt')
      || localStorage.getItem('ohisee_token');
  }

  function setStatus(s, detail) {
    if (root.PortalApp?.setSaveStatus) root.PortalApp.setSaveStatus(s, detail);
  }

  function completionPct() {
    const PC = root.PortalCompletion;
    if (!PC) return 0;
    return PC.projectCompletionPercent({
      workflowStep: currentStep,
      status: 'draft',
      setupState,
      landSiteState,
      requirementsState,
    });
  }

  function readCurrentFormState() {
    if (!mountEl) return;
    if (currentStep === 1) {
      const form = mountEl.querySelector('#project-setup-form');
      if (form) setupState = window.ProjectSetupForm.readFormState(form, setupState);
    } else if (currentStep === 2) {
      const form = mountEl.querySelector('#land-site-form');
      if (form) landSiteState = window.LandSiteForm.readFormState(form, landSiteState);
    } else if (currentStep === 3) {
      const form = mountEl.querySelector('#requirements-form');
      if (form) requirementsState = window.RequirementsStep.readFormState(form, requirementsState);
    }
    syncAnswers();
  }

  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    setStatus('unsaved');
    autoSaveTimer = setTimeout(() => {
      persistDraftToServer({ manual: false }).catch(() => {});
    }, AUTO_SAVE_MS);
  }

  async function flushAutoSave() {
    clearTimeout(autoSaveTimer);
    if (root.PortalApp?.getState?.().saveStatus === 'unsaved') {
      await persistDraftToServer({ manual: false });
    }
  }

  function refreshSummary() {
    try {
      if (root.PortalSummary?.refresh) root.PortalSummary.refresh();
    } catch (err) {
      console.warn('portal summary refresh', err);
    }
  }

  function syncAnswers() {
    if (!window._intentAnswers) window._intentAnswers = {};
    window._intentAnswers.projectSetup = setupState;
    window._intentAnswers.landSite = landSiteState;
    if (requirementsState && window.RequirementsStep) {
      window._intentAnswers = {
        ...window._intentAnswers,
        ...window.RequirementsStep.toIntentAnswers(requirementsState),
      };
    }
  }

  function saveDraft(showToast = false) {
    syncAnswers();
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        answers: window._intentAnswers,
        projectSetup: setupState,
        landSite: landSiteState,
        requirements: requirementsState,
        currentStep,
        projectId: projectSavedOnServer ? (projectId || window._ohiseeLinkedProjectId || null) : null,
        savedAt: Date.now(),
      }));
      if (showToast) setStatus('saved');
    } catch { /* ignore */ }
  }

  function loadDraft({ restoreProjectId = false, keepStep = false } = {}) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d?.projectSetup) setupState = d.projectSetup;
      if (d?.landSite) landSiteState = d.landSite;
      if (d?.requirements) requirementsState = d.requirements;
      if (d?.currentStep && !keepStep) currentStep = d.currentStep;
      if (restoreProjectId && d?.projectId) {
        projectId = d.projectId;
        window._ohiseeLinkedProjectId = d.projectId;
      }
    } catch { /* ignore */ }
  }

  const FIELD_LABELS = {
    project_name: 'Project name', project_type: 'Project type', construction_type: 'Construction type',
    description: 'Project description', owner_name: 'Owner name', owner_email: 'Email',
    owner_phone: 'Phone', ownership_status: 'Ownership status', owner_address: 'Correspondence address',
    site_address: 'Site address', state: 'State', city: 'City', pincode: 'Pincode',
    floors: 'Floors', built_up_area: 'Built-up area', start_date: 'Start date',
    target_completion_date: 'Target completion date', documents: 'Land ownership document',
  };

  function formatValidationErrors(errors) {
    const labels = Object.keys(errors).map((k) => FIELD_LABELS[k] || k);
    if (!labels.length) return 'Please fix the highlighted fields before continuing.';
    return `Please complete: ${labels.join(', ')}.`;
  }

  async function loadProject(pid) {
    if (!pid || !getToken()) return null;
    try {
      const resp = await fetch(`${apiBase()}/projects/${encodeURIComponent(pid)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) {
        projectId = null;
        window._ohiseeLinkedProjectId = null;
        projectSavedOnServer = false;
        return null;
      }
      const result = await resp.json().catch(() => ({}));
      const p = result.data || result;
      const ctx = p.construction_context || {};
      if (ctx.projectSetup) setupState = { ...window.ProjectSetupModel.defaults(), ...ctx.projectSetup };
      if (ctx.landSite) landSiteState = { ...window.LandSiteModel.fromStored({ projectSetup: setupState }), ...ctx.landSite };
      if (ctx.intentAnswers || ctx.requirements || ctx.projectRequirements) {
        requirementsState = window.RequirementsStep.defaults(setupState || {}, landSiteState || {});
        Object.assign(requirementsState, ctx.intentAnswers || ctx.requirements || ctx.projectRequirements || {});
      }
      projectSavedOnServer = true;
      lastServerSaveAt = p.last_saved_at || p.updated_at || null;
      try { sessionStorage.setItem(ACTIVE_DRAFT_KEY, pid); } catch { /* ignore */ }
      return p;
    } catch (e) {
      console.warn('portal workflow load', e);
      projectId = null;
      window._ohiseeLinkedProjectId = null;
      projectSavedOnServer = false;
      return null;
    }
  }

  function isNotFoundError(resp, result) {
    if (resp?.status === 404) return true;
    const msg = String(result?.error || '').toLowerCase();
    return msg.includes('not found');
  }

  function showError(msg) {
    const err = mountEl?.querySelector('#cp-wizard-err');
    if (err) { err.textContent = msg; err.hidden = false; }
  }

  function clearError() {
    const err = mountEl?.querySelector('#cp-wizard-err');
    if (err) { err.textContent = ''; err.hidden = true; }
  }

  function renderBody() {
    if (currentStep === 1) {
      if (!setupState) setupState = window.ProjectSetupModel.fromAnswers(window._intentAnswers || {});
      return `
        <div class="ps-page-header">
          <p class="cp-kicker">STEP 1 OF 8 — Project Setup</p>
          <h2 class="cp-page-title">Project Details</h2>
          <p class="cp-page-desc">Basic information about your construction project</p>
        </div>
        <div id="project-setup-mount">${window.ProjectSetupForm.renderForm(setupState, validationErrors)}</div>`;
    }
    if (currentStep === 2) {
      if (!landSiteState) landSiteState = window.LandSiteModel.fromStored({ projectSetup: setupState });
      return `
        <div class="ps-page-header">
          <p class="cp-kicker">STEP 2 OF 8 — Land &amp; Site</p>
          <h2 class="cp-page-title">Land &amp; Site</h2>
          <p class="cp-page-desc">Plot dimensions, setbacks and site conditions</p>
        </div>
        <div id="land-site-mount">${window.LandSiteForm.renderForm(landSiteState, validationErrors)}</div>`;
    }
    if (!requirementsState) requirementsState = window.RequirementsStep.defaults(setupState || {}, landSiteState || {});
    Object.assign(requirementsState, { plot_length: landSiteState?.plot_length_ft || requirementsState.plot_length, plot_width: landSiteState?.plot_width_ft || requirementsState.plot_width, ...Object.fromEntries(['setback_front_ft','setback_rear_ft','setback_left_ft','setback_right_ft'].map(k => [k, landSiteState?.[k] ?? 0])) });
    return `<div id="requirements-mount">${window.RequirementsStep.renderForm(requirementsState, validationErrors, setupState || {})}</div>`;
  }

  function nextLabel() {
    return {
      1: 'Next: Land & Site',
      2: 'Next: Requirements',
      3: 'Next: Design & Engineering \u2192',
    }[currentStep] || 'Continue';
  }

  function step1DocCallbacks(mount) {
    return {
      onRemoveDoc: (index) => {
        setupState.documents.splice(index, 1);
        pendingFiles.splice(index, 1);
        if (window.ProjectSetupModel.hasOwnershipDoc(setupState.documents)) delete validationErrors.documents;
        window.ProjectSetupForm.updateDocList(mount, setupState, validationErrors, step1DocCallbacks(mount));
        syncAnswers();
        saveDraft(false);
        scheduleAutoSave();
        refreshSummary();
      },
    };
  }

  function bindStep1() {
    const mount = mountEl.querySelector('#project-setup-mount');
    if (!mount) return;
    const docCb = step1DocCallbacks(mount);
    window.ProjectSetupForm.bindForm(mount, setupState, {
      onChange: (s) => { setupState = s; syncAnswers(); saveDraft(false); scheduleAutoSave(); refreshSummary(); },
      onFiles: (fileList) => {
        if (!fileList?.length) return;
        const docType = mountEl.querySelector('#ps-doc-type')?.value || 'other';
        for (const file of fileList) {
          const check = window.ProjectSetupModel.validateFile(file);
          if (!check.ok) { showError(check.error); continue; }
          pendingFiles.push({ file, document_type: docType });
          setupState.documents = setupState.documents || [];
          setupState.documents.push({
            document_type: docType, file_name: file.name, file_size: file.size,
            mime_type: file.type || 'application/octet-stream', status: 'pending', local: true,
          });
        }
        if (window.ProjectSetupModel.hasOwnershipDoc(setupState.documents)) {
          delete validationErrors.documents;
          clearError();
        }
        window.ProjectSetupForm.updateDocList(mount, setupState, validationErrors, docCb);
        syncAnswers();
        saveDraft(false);
        scheduleAutoSave();
        refreshSummary();
      },
      ...docCb,
    });
  }

  function step2DocCallbacks(mount) {
    return {
      onRemoveDoc: (index) => {
        landSiteState.documents.splice(index, 1);
        landPendingFiles.splice(index, 1);
        window.LandSiteForm.updateDocList(mount, landSiteState, validationErrors, step2DocCallbacks(mount));
        syncAnswers();
        saveDraft(false);
        scheduleAutoSave();
        refreshSummary();
      },
    };
  }

  function bindStep2() {
    const mount = mountEl.querySelector('#land-site-mount');
    if (!mount) return;
    const docCb = step2DocCallbacks(mount);
    window.LandSiteForm.bindForm(mount, landSiteState, {
      onChange: (s) => { landSiteState = s; syncAnswers(); saveDraft(false); scheduleAutoSave(); refreshSummary(); },
      onFiles: (fileList) => {
        if (!fileList?.length) return;
        const docType = mountEl.querySelector('#ls-doc-type')?.value || 'land_ownership';
        for (const file of fileList) {
          if (file.size > 25 * 1024 * 1024) { showError('File too large (max 25 MB).'); continue; }
          landPendingFiles.push({ file, document_type: docType });
          landSiteState.documents = landSiteState.documents || [];
          landSiteState.documents.push({
            document_type: docType, file_name: file.name, file_size: file.size,
            mime_type: file.type || 'application/octet-stream', status: 'pending', local: true,
          });
        }
        if (window.LandSiteModel.hasLandOwnershipDoc(landSiteState.documents)) delete validationErrors.documents;
        window.LandSiteForm.updateDocList(mount, landSiteState, validationErrors, docCb);
        syncAnswers();
        saveDraft(false);
        scheduleAutoSave();
        refreshSummary();
      },
      ...docCb,
    });
  }

  function bindStep3() {
    const mount = mountEl.querySelector('#requirements-mount');
    if (!mount) return;
    window.RequirementsStep.bindForm(mount, requirementsState, {
      onChange: (s) => { requirementsState = s; syncAnswers(); saveDraft(false); scheduleAutoSave(); refreshSummary(); },
      onFiles: (fileList) => {
        if (!fileList?.length) return;
        for (const file of fileList) {
          if (file.size > 10 * 1024 * 1024) { showError('Reference file too large (max 10 MB).'); continue; }
          requirementsState.reference_files = requirementsState.reference_files || [];
          requirementsState.reference_files.push({
            file_name: file.name, file_size: file.size, mime_type: file.type, status: 'pending', local: true,
          });
        }
        render();
        scheduleAutoSave();
      },
      onRemoveRef: (index) => {
        requirementsState.reference_files.splice(index, 1);
        render();
        scheduleAutoSave();
      },
    });
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function saveProjectSetup({ draft = false } = {}) {
    if (!setupState) throw new Error('Project setup form is not loaded.');
    const PM = window.ProjectSetupModel;
    const payload = PM.toProjectPayload(setupState, { intentType: 'NEW_HOME' });
    payload.status = draft ? 'draft' : 'active';
    payload.construction_context = payload.construction_context || {};
    payload.construction_context.projectSetup = setupState;

    const files = [];
    for (const p of pendingFiles) {
      if (!p.file) continue;
      files.push({ document_type: p.document_type, name: p.file.name, data: await fileToBase64(p.file), mime_type: p.file.type });
    }

    const body = JSON.stringify({
      ...payload,
      documents: files,
      draft,
      workflow_step: currentStep,
      wizardStep: currentStep,
      completion_percentage: completionPct(),
    });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };

    let linkedId = projectSavedOnServer ? (projectId || window._ohiseeLinkedProjectId) : null;
    let url = linkedId ? `${apiBase()}/projects/${linkedId}/setup` : `${apiBase()}/projects/setup`;
    let method = linkedId ? 'PUT' : 'POST';

    let resp = await fetch(url, { method, headers, body });
    let result = await resp.json().catch(() => ({}));

    if (!resp.ok && linkedId && isNotFoundError(resp, result)) {
      linkedId = null;
      projectId = null;
      window._ohiseeLinkedProjectId = null;
      projectSavedOnServer = false;
      resp = await fetch(`${apiBase()}/projects/setup`, { method: 'POST', headers, body });
      result = await resp.json().catch(() => ({}));
    }

    if (!resp.ok) throw new Error(result.error || 'Could not save project.');
    const project = result.data || result;
    if (project.project_id) {
      projectId = project.project_id;
      window._ohiseeLinkedProjectId = project.project_id;
      projectSavedOnServer = true;
    }
    if (typeof ProjectsAPI !== 'undefined') ProjectsAPI.cacheLocally(project);
    (setupState.documents || []).forEach((d) => { if (d.local) d.status = 'uploaded'; });
    pendingFiles = [];
    return project;
  }

  async function saveWizardStep({ publish = false, draft = false } = {}) {
    const pid = projectId || window._ohiseeLinkedProjectId;
    if (!pid) return null;
    const completion = completionPct();
    const resp = await fetch(`${apiBase()}/projects/${pid}/wizard`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        projectSetup: setupState,
        landSite: landSiteState,
        requirements: window.RequirementsStep.toIntentAnswers(requirementsState || {}),
        wizardStep: currentStep,
        workflow_step: currentStep,
        completion_percentage: completion,
        current_stage: STEPS[currentStep - 1],
        publish,
        draft,
      }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(result.error || 'Could not save wizard step.');
    return result.data;
  }

  async function persistDraftToServer({ manual = false } = {}) {
    if (saveInFlight) return { projectId: projectId || window._ohiseeLinkedProjectId };
    if (!getToken()) {
      if (manual) throw new Error('Please log in to save your draft.');
      return null;
    }

    readCurrentFormState();
    saveInFlight = true;
    setStatus('saving');

    try {
      const completion = completionPct();
      let pid = projectSavedOnServer ? (projectId || window._ohiseeLinkedProjectId) : null;

      if (currentStep === 1) {
        const project = await saveProjectSetup({ draft: true });
        pid = project?.project_id || projectId;
        if (pid) {
          projectId = pid;
          window._ohiseeLinkedProjectId = pid;
          projectSavedOnServer = true;
          try { sessionStorage.setItem(ACTIVE_DRAFT_KEY, pid); } catch { /* ignore */ }
        }
      } else {
        if (!pid) throw new Error('Complete Project Setup first to create your project.');
        await saveWizardStep({ draft: true });
        if (root.PortalAPI?.saveDraft) {
          await root.PortalAPI.saveDraft(pid, {
            workflow_step: currentStep,
            wizardStep: currentStep,
            projectSetup: setupState,
            landSite: landSiteState,
            requirements: window.RequirementsStep.toIntentAnswers(requirementsState || {}),
            completion_percentage: completion,
          });
        }
      }

      if (pid) {
        try { sessionStorage.setItem(ACTIVE_DRAFT_KEY, pid); } catch { /* ignore */ }
        await updatePortalWorkflow(currentStep);
      }
      lastServerSaveAt = new Date().toISOString();
      saveDraft(false);
      setStatus('saved');
      refreshSummary();
      return { projectId: pid, completion };
    } catch (err) {
      console.error('Draft save failed:', err);
      setStatus('error', manual ? '⚠ Unable to save draft' : '⚠ Save failed');
      if (manual) throw err;
      return null;
    } finally {
      saveInFlight = false;
    }
  }

  async function updatePortalWorkflow(step) {
    const pid = projectId || window._ohiseeLinkedProjectId;
    if (!pid) return;
    await fetch(`${apiBase()}/portal/projects/${encodeURIComponent(pid)}/workflow`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ workflow_step: step }),
    }).catch(() => {});
  }

  async function validateCurrentStep() {
    validationErrors = {};
    if (currentStep === 1) {
      const form = mountEl.querySelector('#project-setup-form');
      if (form) {
        const docs = setupState?.documents || [];
        setupState = window.ProjectSetupForm.readFormState(form, setupState);
        if (!setupState.documents?.length && docs.length) setupState.documents = docs;
      }
      validationErrors = window.ProjectSetupModel.validate(setupState).errors;
    } else if (currentStep === 2) {
      const form = mountEl.querySelector('#land-site-form');
      if (form) landSiteState = window.LandSiteForm.readFormState(form, landSiteState);
      validationErrors = window.LandSiteModel.validate(landSiteState).errors;
    } else if (currentStep === 3) {
      const form = mountEl.querySelector('#requirements-form');
      if (form) requirementsState = window.RequirementsStep.readFormState(form, requirementsState);
      Object.assign(requirementsState, { ...Object.fromEntries(['setback_front_ft','setback_rear_ft','setback_left_ft','setback_right_ft'].map(k => [k, landSiteState?.[k] ?? 0])), plot_length: landSiteState?.plot_length_ft || requirementsState.plot_length, plot_width: landSiteState?.plot_width_ft || requirementsState.plot_width });
      validationErrors = window.RequirementsStep.validate(requirementsState, {
        allowBudgetOverride: !!requirementsState.budget_exceeded_acknowledged,
      }).errors;
    }
    return Object.keys(validationErrors).length === 0;
  }

  async function goNext() {
    clearError();
    const btn = mountEl.querySelector('#cp-wizard-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    setStatus('saving');

    try {
      const ok = await validateCurrentStep();
      if (!ok) {
        const scrollY = window.scrollY;
        render();
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY, behavior: 'instant' });
          mountEl.querySelector('.ps-field-error, .ps-field input.invalid, .ps-field textarea.invalid')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        showError(formatValidationErrors(validationErrors));
        setStatus('unsaved');
        return;
      }

      if (!getToken()) {
        saveDraft(false);
        if (typeof AuthPrompt !== 'undefined') {
          AuthPrompt.show({
            redirectUrl: 'customer-portal.html?view=workflow&step=1',
            onBeforeRedirect: () => saveDraft(false)
          });
        } else {
          window.location.href = `login.html?tab=register&reason=create_project&redirect=${encodeURIComponent('customer-portal.html?view=workflow&step=1')}`;
        }
        return;
      }

      if (currentStep === 1) {
        const project = await saveProjectSetup({ draft: false });
        currentStep = 2;
        if (project?.project_id) {
          const u = new URL(window.location.href);
          u.searchParams.set('projectId', project.project_id);
          u.searchParams.set('step', '2');
          window.history.replaceState({}, '', u);
        }
        if (!landSiteState) landSiteState = window.LandSiteModel.fromStored({ projectSetup: setupState });
      } else if (currentStep === 2) {
        await saveWizardStep();
        currentStep = 3;
        if (!requirementsState) requirementsState = window.RequirementsStep.defaults(setupState, landSiteState);
      } else if (currentStep === 3) {
        await saveWizardStep({ publish: true });
        const pid = projectId || window._ohiseeLinkedProjectId;
        await updatePortalWorkflow(4);
        saveDraft(false);
        setStatus('saved');
        onComplete?.(4, pid);
        return;
      }

      saveDraft(false);
      setStatus('saved');
      render();
      refreshSummary();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      showError(e.message || 'Save failed.');
      setStatus('unsaved');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = nextLabel(); }
    }
  }

  function goBack() {
    if (currentStep <= 1) return;
    currentStep -= 1;
    validationErrors = {};
    render();
  }

  async function saveDraftClick() {
    const result = await persistDraftToServer({ manual: true });
    return result;
  }

  function render() {
    if (!mountEl) return;
    if (window.ProjectSetupForm?.destroyMap) window.ProjectSetupForm.destroyMap();

    mountEl.innerHTML = `
      <div class="cp-wizard-embed dh-wizard-card">
        <div id="cp-wizard-err" class="dh-err" hidden></div>
        <div class="dh-wizard-body">${renderBody()}</div>
        <div class="form-actions dh-nav-footer">
          <button type="button" class="form-actions__prev" ${currentStep <= 1 ? 'disabled' : ''} id="cp-wizard-back">\u2190 Previous</button>
          <button type="button" class="form-actions__draft" id="cp-wizard-draft">Save as Draft</button>
          <button type="button" class="form-actions__next" id="cp-wizard-next">${esc(nextLabel())}</button>
        </div>
      </div>`;

    if (currentStep === 1) bindStep1();
    else if (currentStep === 2) bindStep2();
    else bindStep3();

    mountEl.querySelector('#cp-wizard-back')?.addEventListener('click', goBack);
    mountEl.querySelector('#cp-wizard-draft')?.addEventListener('click', saveDraftClick);
    mountEl.querySelector('#cp-wizard-next')?.addEventListener('click', goNext);
  }

  async function init(container, options = {}) {
    mountEl = container;
    currentStep = Math.min(3, Math.max(1, options.step || 1));
    onComplete = options.onComplete || null;
    projectSavedOnServer = false;

    if (!window.ProjectSetupModel) {
      mountEl.innerHTML = '<p class="cp-empty">Wizard scripts failed to load.</p>';
      return;
    }

    if (!window._intentAnswers) window._intentAnswers = {};
    setupState = window.ProjectSetupModel.fromAnswers(window._intentAnswers);
    const explicitPid = options.projectId || null;
    const explicitStep = options.step != null ? parseInt(options.step, 10) : null;
    if (!options.freshStart) {
      loadDraft({ restoreProjectId: !!explicitPid, keepStep: explicitStep != null });
    }
    if (!setupState) setupState = window.ProjectSetupModel.defaults();
    currentStep = Math.min(3, Math.max(1, explicitStep || currentStep || 1));

    if (explicitPid) {
      projectId = explicitPid;
      window._ohiseeLinkedProjectId = explicitPid;
      const loaded = await loadProject(explicitPid);
      if (!loaded) {
        projectId = null;
        window._ohiseeLinkedProjectId = null;
        clearError();
      } else if (explicitStep == null && loaded.workflow_step) {
        currentStep = Math.min(3, Math.max(1, parseInt(loaded.workflow_step, 10)));
      }
    } else {
      try {
        const activeDraft = sessionStorage.getItem(ACTIVE_DRAFT_KEY);
        if (activeDraft && options.reuseActiveDraft && !options.freshStart) {
          projectId = activeDraft;
          window._ohiseeLinkedProjectId = activeDraft;
          const loaded = await loadProject(activeDraft);
          if (loaded && loaded.workflow_step && explicitStep == null) {
            currentStep = Math.min(3, Math.max(1, parseInt(loaded.workflow_step, 10)));
          }
        } else {
          projectId = null;
          window._ohiseeLinkedProjectId = null;
        }
      } catch {
        projectId = null;
        window._ohiseeLinkedProjectId = null;
      }
      clearError();
    }
    if (!landSiteState) landSiteState = window.LandSiteModel.fromStored({ projectSetup: setupState });
    if (!requirementsState) requirementsState = window.RequirementsStep.defaults(setupState, landSiteState);
    syncAnswers();
    render();
    refreshSummary();
  }

  function destroy() {
    if (window.ProjectSetupForm?.destroyMap) window.ProjectSetupForm.destroyMap();
    mountEl = null;
  }

  root.PortalWorkflow = {
    init, destroy, saveDraftClick, persistDraftToServer, flushAutoSave,
    getProjectId: () => projectId || window._ohiseeLinkedProjectId,
    getWizardState: () => ({
      setupState, landSiteState, requirementsState, currentStep,
      projectId: projectId || window._ohiseeLinkedProjectId,
      completion: completionPct(),
      lastSavedAt: lastServerSaveAt,
    }),
  };
})(typeof window !== 'undefined' ? window : global);
