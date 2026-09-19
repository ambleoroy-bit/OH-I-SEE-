// OH I SEE — Dream Home wizard (8-step project onboarding)
(function () {
  'use strict';

  const STEPS = [
    'Project Setup', 'Land & Site', 'Requirements',
    'Design & Engineering', 'Builder Quotes', 'Approvals',
    'Project Execution', 'Handover & Maintenance',
  ];

  const DRAFT_KEY = 'ohisee_dream_home_draft';
  const ACTIVE_DRAFT_KEY = 'ohisee_active_draft_project_id';
  const NEW_PROJECT_HREF = 'intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1';
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

  let currentStep = 1;
  let setupState = null;
  let landSiteState = null;
  let requirementsState = null;
  let validationErrors = {};
  let pendingFiles = [];
  let landPendingFiles = [];
  let projectSavedOnServer = false;
  let sessionNeedsLogin = false;

  function apiBase() {
    if (typeof resolveOhiseeApiBase === 'function') return resolveOhiseeApiBase();
    return (location.port === '3000' || location.port === '5173') ? '/api' : 'http://127.0.0.1:3001/api';
  }

  function getToken() {
    return (typeof TokenStore !== 'undefined' ? TokenStore.get() : null)
      || localStorage.getItem('ohisee_jwt')
      || localStorage.getItem('ohisee_token')
      || sessionStorage.getItem('ohisee_token');
  }

  function answers() { return window._intentAnswers || {}; }

  function syncAnswers() {
    if (!window._intentAnswers) window._intentAnswers = {};
    window._intentAnswers.projectSetup = setupState;
    window._intentAnswers.landSite = landSiteState;
    window._intentAnswers.project_name = setupState?.project_name || '';
    if (requirementsState) {
      window._intentAnswers = {
        ...window._intentAnswers,
        ...window.RequirementsStep.toIntentAnswers(requirementsState),
      };
    }
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(currentStep));
    if (window._ohiseeLinkedProjectId) url.searchParams.set('projectId', window._ohiseeLinkedProjectId);
    window.history.replaceState({}, '', url);
  }

  function saveDraft(showToast = true) {
    syncAnswers();
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        answers: answers(),
        projectSetup: setupState,
        landSite: landSiteState,
        requirements: requirementsState,
        currentStep,
        projectId: projectSavedOnServer ? (window._ohiseeLinkedProjectId || null) : null,
        savedAt: Date.now(),
      }));
      if (showToast) {
        const toast = document.getElementById('draft-toast');
        if (toast) { toast.textContent = 'Draft kept in this browser. Use Save as Draft to save to your account.'; toast.classList.add('show'); }
        setTimeout(() => document.getElementById('draft-toast')?.classList.remove('show'), 2000);
      }
    } catch (e) { /* ignore */ }
  }

  function loadDraft({ restoreProjectId = false, restoreStep = true } = {}) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d?.projectSetup) setupState = d.projectSetup;
      else if (d?.answers?.projectSetup) setupState = d.answers.projectSetup;
      if (d?.landSite) landSiteState = d.landSite;
      else if (d?.answers?.landSite) landSiteState = d.answers.landSite;
      if (d?.requirements) requirementsState = d.requirements;
      if (restoreStep && d?.currentStep) currentStep = d.currentStep;
      if (d?.answers) Object.assign(window._intentAnswers || {}, d.answers);
      if (restoreProjectId && d?.projectId) window._ohiseeLinkedProjectId = d.projectId;
    } catch (e) { /* ignore */ }
  }

  function clearWizardState() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(ACTIVE_DRAFT_KEY); } catch { /* ignore */ }
    window._ohiseeLinkedProjectId = null;
    projectSavedOnServer = false;
    currentStep = 1;
    validationErrors = {};
    pendingFiles = [];
    landPendingFiles = [];
    window._intentAnswers = {};
    setupState = window.ProjectSetupModel?.defaults() || null;
    landSiteState = window.LandSiteModel?.fromStored({ projectSetup: setupState }) || null;
    requirementsState = window.RequirementsStep?.defaults(setupState || {}, landSiteState || {}) || null;
    syncAnswers();
  }

  async function loadProjectFromServer(pid) {
    if (!pid || !getToken()) return null;
    try {
      const resp = await fetch(`${apiBase()}/projects/${encodeURIComponent(pid)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) {
        window._ohiseeLinkedProjectId = null;
        projectSavedOnServer = false;
        return null;
      }
      const result = await resp.json().catch(() => ({}));
      const p = result.data || result;
      const ctx = p.construction_context || {};
      if (ctx.projectSetup) setupState = { ...window.ProjectSetupModel.defaults(), ...ctx.projectSetup };
      if (ctx.landSite) {
        landSiteState = { ...window.LandSiteModel.fromStored({ projectSetup: setupState }), ...ctx.landSite };
      }
      if (ctx.intentAnswers || ctx.requirements || ctx.projectRequirements) {
        requirementsState = window.RequirementsStep.defaults(setupState || {}, landSiteState || {});
        Object.assign(requirementsState, ctx.intentAnswers || ctx.requirements || ctx.projectRequirements || {});
      }
      window._ohiseeLinkedProjectId = pid;
      projectSavedOnServer = true;
      try { sessionStorage.setItem(ACTIVE_DRAFT_KEY, pid); } catch { /* ignore */ }
      syncAnswers();
      return p;
    } catch (e) {
      console.warn('intent wizard load project', e);
      return null;
    }
  }

  function isNotFoundError(resp, result) {
    if (resp?.status === 404) return true;
    const msg = String(result?.error || '').toLowerCase();
    return msg.includes('not found');
  }

  function stepper() {
    return `<div class="dh-stepper" role="navigation" aria-label="Progress">${STEPS.map((title, i) => {
      const n = i + 1;
      const active = n === currentStep;
      const done = n < currentStep;
      const line = i ? `<div class="dh-step-line ${done || active ? 'done' : ''}"></div>` : '';
      return `${line}<div class="dh-step ${active ? 'active' : ''} ${done ? 'done' : ''}">
        <span class="dh-step-num">${n}</span><span class="dh-step-label">${esc(title)}</span></div>`;
    }).join('')}</div>`;
  }

  function renderStep1() {
    const PS = window.ProjectSetupForm;
    const PM = window.ProjectSetupModel;
    if (!PS || !PM) return '<p>Loading project setup form…</p>';
    if (!setupState) setupState = PM.fromAnswers(answers());
    return `
      <div class="ps-page-header">
        <p class="dh-kicker">STEP 1 OF ${STEPS.length} — 1.1 Project Details</p>
        <h2 class="dh-title">Project Details</h2>
        <p class="dh-desc">Provide basic information about your construction project</p>
      </div>
      <div id="wizard-err" class="dh-err" hidden></div>
      <div id="project-setup-mount">${PS.renderForm(setupState, validationErrors)}</div>`;
  }

  function renderStep2() {
    const LSF = window.LandSiteForm;
    const LSM = window.LandSiteModel;
    if (!LSF || !LSM) return '<p>Loading land &amp; site form…</p>';
    if (!landSiteState) landSiteState = LSM.fromStored({ projectSetup: setupState, landSite: answers().landSite });
    return `
      <div class="ps-page-header">
        <p class="dh-kicker">STEP 2 OF ${STEPS.length} — 2.1 Land &amp; Site</p>
        <h2 class="dh-title">Land &amp; Site</h2>
        <p class="dh-desc">Plot dimensions, setbacks and site conditions for <strong>${esc(setupState?.project_name || 'your project')}</strong></p>
      </div>
      <div id="wizard-err" class="dh-err" hidden></div>
      <div id="land-site-mount">${LSF.renderForm(landSiteState, validationErrors)}</div>`;
  }

  function renderStep3() {
    const RS = window.RequirementsStep;
    if (!RS) return '<p>Loading requirements form…</p>';
    if (!requirementsState) requirementsState = RS.defaults(setupState || {}, landSiteState || {});
    return `
      <div id="wizard-err" class="dh-err" hidden></div>
      <div id="requirements-mount">${RS.renderForm(requirementsState, validationErrors, setupState || {})}</div>`;
  }

  function portalWorkflowUrl(step) {
    const pid = window._ohiseeLinkedProjectId || '';
    return `customer-portal.html?view=workflow&step=${step}&projectId=${encodeURIComponent(pid)}`;
  }

  function renderFutureStep(n) {
    const hints = {
      4: 'Generate 2D floor plans, 3D visualization, engineering designs and BOQ from your saved requirements.',
      5: 'Review builder quotes, compare scope and select your construction partner.',
      6: 'Approve final design, BOQ, contract and payment schedule before construction starts.',
      7: 'Track construction milestones, site updates, materials and payments.',
      8: 'Complete handover checklist, receive certificates and raise maintenance requests.',
    };
    const pid = window._ohiseeLinkedProjectId;
    return `
      <div class="ps-page-header">
        <p class="dh-kicker">STEP ${n} OF ${STEPS.length}</p>
        <h2 class="dh-title">${esc(STEPS[n - 1])}</h2>
        <p class="dh-desc">${hints[n] || 'Continue in the Customer Portal.'}</p>
      </div>
      <section class="ps-section">
        <div class="ps-section-body">
          <p>${hints[n]}</p>
          ${pid ? `<p style="margin-top:16px">
            <a class="pw-btn pw-btn-primary" href="${portalWorkflowUrl(n)}">Open in Customer Portal →</a>
            ${n === 4 ? `<a class="pw-btn" href="project-floor-plan.html?projectId=${encodeURIComponent(pid)}" style="margin-left:8px">2D Floor Plan</a>
            <a class="pw-btn" href="project-3d.html?projectId=${encodeURIComponent(pid)}" style="margin-left:8px">3D Home</a>` : ''}
            ${n >= 7 ? `<a class="pw-btn" href="project-overview.html?projectId=${encodeURIComponent(pid)}" style="margin-left:8px">Project Workspace</a>` : ''}
          </p>` : ''}
        </div>
      </section>`;
  }

  function renderBody() {
    if (currentStep === 1) return renderStep1();
    if (currentStep === 2) return renderStep2();
    if (currentStep === 3) return renderStep3();
    if (currentStep === 4) return '<div id="design-workspace-mount"></div>';
    return renderFutureStep(currentStep);
  }

  function nextLabel() {
    const labels = {
      1: 'Next: Land & Site →',
      2: 'Next: Requirements →',
      3: 'Next: Design & Engineering →',
      4: 'Next: Builder Quotes →',
      5: 'Next: Approvals →',
      6: 'Next: Project Execution →',
      7: 'Next: Handover →',
      8: 'Open Customer Portal →',
    };
    return labels[currentStep] || 'Continue →';
  }

  async function updatePortalWorkflow(step) {
    const pid = window._ohiseeLinkedProjectId;
    if (!pid || !getToken()) return;
    try {
      await fetch(`${apiBase()}/portal/projects/${encodeURIComponent(pid)}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ workflow_step: step }),
      });
    } catch (e) { console.warn('workflow update', e); }
  }

  function renderNav() {
    if (currentStep === 4) return '';
    return `
      <div class="form-actions dh-nav-footer">
        <button type="button" class="form-actions__prev" ${currentStep <= 1 ? 'disabled' : ''} id="dh-btn-back">\u2190 Previous</button>
        <button type="button" class="form-actions__draft" id="dh-btn-draft">Save as Draft</button>
        <button type="button" class="form-actions__next dh-generate-report" id="dh-btn-next">${esc(nextLabel())}</button>
      </div>`;
  }

  function mountDesignWorkspace() {
    const mount = document.getElementById('design-workspace-mount');
    const pid = window._ohiseeLinkedProjectId;
    if (!mount) return;
    if (!window.DesignWorkspace) {
      mount.innerHTML = '<p class="cp-empty">Design workspace scripts failed to load. Hard refresh (Ctrl+Shift+R).</p>';
      return;
    }
    if (!pid) {
      mount.innerHTML = '<p class="cp-empty">Complete and save Steps 1\u20133 before Design &amp; Engineering.</p>';
      return;
    }
    DesignWorkspace.mount(mount, {
      projectId: pid,
      onPrevious: () => goBack(),
      onComplete: (id) => {
        window.location.href = `customer-portal.html?view=workflow&step=5&projectId=${encodeURIComponent(id)}`;
      },
    });
  }

  function step1DocCallbacks(mount) {
    return {
      onRemoveDoc: (index) => {
        setupState.documents.splice(index, 1);
        pendingFiles.splice(index, 1);
        if (window.ProjectSetupModel.hasOwnershipDoc(setupState.documents)) {
          delete validationErrors.documents;
        }
        window.ProjectSetupForm.updateDocList(mount, setupState, validationErrors, step1DocCallbacks(mount));
        syncAnswers();
        renderSidebar();
        saveDraft(false);
      },
    };
  }

  function bindStep1() {
    const mount = document.getElementById('project-setup-mount');
    if (!mount || !window.ProjectSetupForm) return;
    const docCb = step1DocCallbacks(mount);
    window.ProjectSetupForm.bindForm(mount, setupState, {
      onChange: (state) => { setupState = state; syncAnswers(); renderSidebar(); saveDraft(false); },
      onMapPick: () => { /* map + link updated in project-setup-form */ },
      onFiles: (fileList) => {
        if (!fileList?.length) return;
        const docType = document.getElementById('ps-doc-type')?.value || 'other';
        let added = false;
        for (const file of fileList) {
          const check = window.ProjectSetupModel.validateFile(file);
          if (!check.ok) { showError(check.error); continue; }
          const dup = (setupState.documents || []).some((d) => d.file_name === file.name && d.document_type === docType);
          if (dup) continue;
          pendingFiles.push({ file, document_type: docType });
          setupState.documents = setupState.documents || [];
          setupState.documents.push({
            document_type: docType, file_name: file.name, file_size: file.size,
            mime_type: file.type || 'application/octet-stream', status: 'pending', local: true,
          });
          added = true;
        }
        if (!added) return;
        if (window.ProjectSetupModel.hasOwnershipDoc(setupState.documents)) {
          delete validationErrors.documents;
          clearError();
        }
        window.ProjectSetupForm.updateDocList(mount, setupState, validationErrors, docCb);
        syncAnswers();
        renderSidebar();
        saveDraft(false);
      },
      ...docCb,
    });
  }

  function step2DocCallbacks(mount) {
    return {
      onRemoveDoc: (index) => {
        landSiteState.documents.splice(index, 1);
        landPendingFiles.splice(index, 1);
        if (window.LandSiteModel.hasLandOwnershipDoc(landSiteState.documents)) {
          delete validationErrors.documents;
        }
        window.LandSiteForm.updateDocList(mount, landSiteState, validationErrors, step2DocCallbacks(mount));
        syncAnswers();
        saveDraft(false);
      },
    };
  }

  function bindStep2() {
    const mount = document.getElementById('land-site-mount');
    if (!mount || !window.LandSiteForm) return;
    const docCb = step2DocCallbacks(mount);
    window.LandSiteForm.bindForm(mount, landSiteState, {
      onChange: (state) => {
        landSiteState = state;
        syncAnswers();
        saveDraft(false);
      },
      onFiles: (fileList) => {
        if (!fileList?.length) return;
        const docType = document.getElementById('ls-doc-type')?.value || 'land_ownership';
        let added = false;
        for (const file of fileList) {
          if (file.size > 25 * 1024 * 1024) { showError('File too large (max 25 MB).'); continue; }
          landPendingFiles.push({ file, document_type: docType });
          landSiteState.documents = landSiteState.documents || [];
          landSiteState.documents.push({
            document_type: docType, file_name: file.name, file_size: file.size,
            mime_type: file.type || 'application/octet-stream', status: 'pending', local: true,
          });
          added = true;
        }
        if (!added) return;
        if (window.LandSiteModel.hasLandOwnershipDoc(landSiteState.documents)) {
          delete validationErrors.documents;
          clearError();
        }
        window.LandSiteForm.updateDocList(mount, landSiteState, validationErrors, docCb);
        syncAnswers();
        saveDraft(false);
      },
      ...docCb,
    });
  }

  function bindStep3() {
    const mount = document.getElementById('requirements-mount');
    if (!mount || !window.RequirementsStep) return;
    window.RequirementsStep.bindForm(mount, requirementsState, (state) => {
      requirementsState = state;
      syncAnswers();
      renderSidebar();
      saveDraft(false);
    });
  }

  function showError(msg, { signIn = false } = {}) {
    const err = document.getElementById('wizard-err');
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
    err.setAttribute('role', 'alert');
    if (signIn) {
      const link = document.createElement('a');
      link.href = 'login.html?tab=login&redirect=account.html';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = ' Sign in in a new tab, then return here and retry.';
      err.appendChild(link);
    }
    requestAnimationFrame(() => err.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function handleSaveError(error) {
    if (error.status === 401) {
      sessionNeedsLogin = true;
      if (typeof TokenStore !== 'undefined') TokenStore.clear();
      else {
        localStorage.removeItem('ohisee_jwt');
        localStorage.removeItem('ohisee_token');
        sessionStorage.removeItem('ohisee_token');
      }
      saveDraft(false);
      showError('Your session has expired or could not be verified. Your project details and selected files are still here.', { signIn: true });
      return;
    }
    showError(error.message || 'Save failed.');
  }

  function clearError() {
    const err = document.getElementById('wizard-err');
    if (err) { err.textContent = ''; err.hidden = true; }
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
    const PM = window.ProjectSetupModel;
    const payload = PM.toProjectPayload(setupState, { intentType: window._intentType || 'NEW_HOME' });
    payload.status = draft ? 'draft' : 'active';
    payload.construction_context.projectSetup = setupState;

    const files = [];
    for (const p of pendingFiles) {
      if (!p.file) continue;
      files.push({ document_type: p.document_type, name: p.file.name, data: await fileToBase64(p.file), mime_type: p.file.type });
    }

    const body = JSON.stringify({ ...payload, documents: files, draft });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
    let linkedId = projectSavedOnServer ? window._ohiseeLinkedProjectId : null;
    let url = linkedId ? `${apiBase()}/projects/${linkedId}/setup` : `${apiBase()}/projects/setup`;
    let method = linkedId ? 'PUT' : 'POST';
    let resp = await fetch(url, { method, headers, body });
    let result = await resp.json().catch(() => ({}));
    if (!resp.ok && linkedId && isNotFoundError(resp, result)) {
      window._ohiseeLinkedProjectId = null;
      projectSavedOnServer = false;
      resp = await fetch(`${apiBase()}/projects/setup`, { method: 'POST', headers, body });
      result = await resp.json().catch(() => ({}));
    }
    if (!resp.ok) throw Object.assign(new Error(result.error || 'Could not save project.'), { status: resp.status });
    sessionNeedsLogin = false;
    const project = result.data || result;
    if (project.project_id) {
      window._ohiseeLinkedProjectId = project.project_id;
      projectSavedOnServer = true;
      try { sessionStorage.setItem(ACTIVE_DRAFT_KEY, project.project_id); } catch { /* ignore */ }
    }
    if (typeof ProjectsAPI !== 'undefined') ProjectsAPI.cacheLocally(project);
    (setupState.documents || []).forEach((d) => { if (d.local) d.status = 'uploaded'; });
    pendingFiles = [];
    return project;
  }

  async function saveWizardStep({ publish = false, draft = false } = {}) {
    const pid = window._ohiseeLinkedProjectId;
    if (!pid || !getToken()) return null;
    const stages = [
      'Project Setup', 'Land & Site', 'Requirements', 'Design & Engineering',
      'Builder Quotes', 'Approvals', 'Project Execution', 'Handover & Maintenance',
    ];
    const resp = await fetch(`${apiBase()}/projects/${pid}/wizard`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        projectSetup: setupState,
        landSite: landSiteState,
        requirements: window.RequirementsStep.toIntentAnswers(requirementsState || {}),
        wizardStep: currentStep,
        workflow_step: currentStep,
        current_stage: stages[currentStep - 1] || 'Project Setup',
        publish,
        draft,
      }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) throw Object.assign(new Error(result.error || 'Could not save wizard step.'), { status: resp.status });
    if (result.data && typeof ProjectsAPI !== 'undefined') ProjectsAPI.cacheLocally(result.data);
    return result.data;
  }

  const FIELD_LABELS = {
    project_name: 'Project name', construction_type: 'Construction type', ownership_status: 'Ownership status',
    owner_address: 'Correspondence address', description: 'Project description', documents: 'Land ownership document',
    plot_length_ft: 'Plot length',
    plot_width_ft: 'Plot width',
    plot_shape: 'Plot shape',
    road_facing: 'Road facing',
    access_road_type: 'Access road type',
    setback_front_ft: 'Front setback',
    setback_rear_ft: 'Rear setback',
    setback_left_ft: 'Left setback',
    setback_right_ft: 'Right setback',
    second_road_facing: 'Second road facing',
    documents: 'Land ownership document',
    bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms',
    floors: 'Floors',
    budget: 'Budget',
    quality: 'Quality level',
  };

  function formatValidationErrors(errors) {
    const labels = Object.keys(errors).map((k) => FIELD_LABELS[k] || k);
    if (!labels.length) return 'Please fix the highlighted fields before continuing.';
    return `Please complete: ${labels.join(', ')}.`;
  }

  async function validateCurrentStep() {
    validationErrors = {};
    if (currentStep === 1) {
      const form = document.getElementById('project-setup-form');
      if (form) {
        const docs = setupState?.documents || [];
        setupState = window.ProjectSetupForm.readFormState(form, setupState);
        if (!setupState.documents?.length && docs.length) setupState.documents = docs;
      }
      validationErrors = window.ProjectSetupModel.validate(setupState).errors;
    } else if (currentStep === 2) {
      const form = document.getElementById('land-site-form');
      if (form) {
        const docs = landSiteState?.documents || [];
        landSiteState = window.LandSiteForm.readFormState(form, landSiteState);
        if (!landSiteState.documents?.length && docs.length) landSiteState.documents = docs;
      }
      validationErrors = window.LandSiteModel.validate(landSiteState).errors;
    } else if (currentStep === 3) {
      const form = document.getElementById('requirements-form');
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
    const btn = document.getElementById('dh-btn-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      if (sessionNeedsLogin && !getToken()) {
        handleSaveError({ status: 401 });
        return;
      }
      if (currentStep <= 3) {
        const ok = await validateCurrentStep();
        if (!ok) {
          const scrollY = window.scrollY;
          render();
          requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY, behavior: 'instant' });
            const firstErr = document.querySelector('.ps-field-error, .ps-field input.invalid, .ps-field textarea.invalid');
            if (firstErr) {
              firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
          showError(formatValidationErrors(validationErrors));
          return;
        }
      }

      if (currentStep === 1) {
        if (!getToken()) {
          saveDraft();
          if (typeof AuthPrompt !== 'undefined') {
            AuthPrompt.show({
              redirectUrl: 'intent-engine.html?intent=NEW_HOME&step=1',
              onBeforeRedirect: () => saveDraft()
            });
          } else {
            window.location.href = `login.html?tab=register&reason=create_project&redirect=${encodeURIComponent('intent-engine.html?intent=NEW_HOME&step=1')}`;
          }
          return;
        }
        await saveProjectSetup({ draft: false });
        currentStep = 2;
        if (!landSiteState) landSiteState = window.LandSiteModel.fromStored({ projectSetup: setupState });
      } else if (currentStep === 2) {
        if (!window._ohiseeLinkedProjectId) throw new Error('Save Step 1 first.');
        await saveWizardStep();
        currentStep = 3;
        if (!requirementsState) requirementsState = window.RequirementsStep.defaults(setupState, landSiteState);
      } else if (currentStep === 3) {
        await saveWizardStep({ publish: true });
        syncAnswers();
        await updatePortalWorkflow(4);
        currentStep = 4;
      } else if (currentStep < 8) {
        if (window._ohiseeLinkedProjectId) await saveWizardStep();
        await updatePortalWorkflow(currentStep + 1);
        if (new URLSearchParams(window.location.search).get('portal') === '1' || currentStep >= 4) {
          window.location.href = portalWorkflowUrl(currentStep + 1);
          return;
        }
        currentStep += 1;
      } else {
        const pid = window._ohiseeLinkedProjectId;
        await updatePortalWorkflow(8);
        if (pid) window.location.href = `customer-portal.html?view=handover&projectId=${encodeURIComponent(pid)}`;
        return;
      }

      saveDraft(false);
      updateUrl();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      handleSaveError(e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = nextLabel(); }
    }
  }

  function goBack() {
    if (currentStep <= 1) return;
    currentStep -= 1;
    validationErrors = {};
    saveDraft(false);
    updateUrl();
    render();
  }

  async function saveDraftClick() {
    if (currentStep === 1) {
      const form = document.getElementById('project-setup-form');
      if (form) setupState = window.ProjectSetupForm.readFormState(form, setupState);
    } else if (currentStep === 2) {
      const form = document.getElementById('land-site-form');
      if (form) landSiteState = window.LandSiteForm.readFormState(form, landSiteState);
    } else if (currentStep === 3) {
      const form = document.getElementById('requirements-form');
      if (form) requirementsState = window.RequirementsStep.readFormState(form, requirementsState);
    }
    syncAnswers();
    saveDraft(false);
    try {
      if (!getToken()) throw new Error('Please sign in as the customer to save this project to your account.');
      await saveProjectSetup({ draft: true });
      if (currentStep > 1) await saveWizardStep({ draft: true });
      saveDraft(false);
      vdToastDraftSaved();
    } catch (e) {
      if (e.status === 401) { handleSaveError(e); return; }
      showError((e.message || 'Server save failed.') + ' Your draft is kept in this browser only. Retry Save as Draft to make it available in Client Leads.');
    }
  }

  function vdToastDraftSaved() {
    const toast = document.getElementById('draft-toast');
    if (toast) {
      toast.textContent = 'Draft saved to your account. Resume anytime from Drafts.';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2800);
    }
  }

  const PORTAL_NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', href: 'customer-portal.html?view=dashboard' },
    { id: 'new-project', label: 'New Project', icon: 'new', href: NEW_PROJECT_HREF, active: true },
    { id: 'drafts', label: 'Drafts', icon: 'projects', href: 'customer-portal.html?view=drafts' },
    { id: 'projects', label: 'My Projects', icon: 'projects', href: 'customer-portal.html?view=projects' },
    { id: 'quotes', label: 'Builder Quotes', icon: 'quotes', href: 'customer-portal.html?view=quotes' },
    { id: 'materials', label: 'Material Orders', icon: 'materials', href: 'customer-portal.html?view=materials' },
    { id: 'payments', label: 'Payments', icon: 'payments', href: 'customer-portal.html?view=payments' },
    { id: 'messages', label: 'Messages', icon: 'messages', href: 'customer-portal.html?view=messages' },
    { id: 'site-updates', label: 'Site Updates', icon: 'site', href: 'customer-portal.html?view=site-updates' },
    { id: 'handover', label: 'Handover Documents', icon: 'handover', href: 'customer-portal.html?view=handover' },
    { id: 'profile', label: 'My Profile', icon: 'profile', href: 'customer-portal.html?view=profile' },
    { id: 'support', label: 'Support', icon: 'support', href: 'customer-portal.html?view=support' },
  ];

  function navIcon(name) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z"/></svg>',
      new: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V9"/><path d="M9 3h6v6H9z"/><path d="M12 11v6M9 14h6"/></svg>',
      projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
      quotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h12v16l-3-3H6z"/></svg>',
      materials: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></svg>',
      payments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
      messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H8l-4 3V6a1 1 0 011-1z"/></svg>',
      site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2"/></svg>',
      handover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6"/></svg>',
      profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>',
      support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a3 3 0 015 1c0 2-3 2-3 4"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>',
    };
    return icons[name] || icons.home;
  }

  function renderPortalSidebar() {
    const sidebar = document.getElementById('dream-home-sidebar');
    if (!sidebar) return;

    const user = typeof UserCache !== 'undefined' ? UserCache.get() : null;
    const name = user?.name || user?.email || 'Customer';
    const initial = name.slice(0, 1).toUpperCase();
    const pid = window._ohiseeLinkedProjectId || '';
    const portalQs = pid ? `&projectId=${encodeURIComponent(pid)}` : '';

    sidebar.innerHTML = `
      <div class="dh-cp-sidebar">
        <h2 class="dh-cp-title">Customer Portal</h2>
        <div class="dh-cp-user">
          <div class="dh-cp-avatar" aria-hidden="true">
            <img src="/images/dream-home-expert.png" alt="" width="56" height="56" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="dh-cp-avatar-fallback">${esc(initial)}</span>
          </div>
        </div>
        <nav class="dh-cp-nav" aria-label="Customer portal">
          ${PORTAL_NAV.map((item) => {
            const href = item.href.includes('?') && portalQs ? item.href + portalQs : item.href;
            return `<a class="dh-cp-nav-link ${item.active ? 'active' : ''}" href="${href}">
              <span class="dh-cp-nav-icon">${navIcon(item.icon)}</span>
              <span>${esc(item.label)}</span>
            </a>`;
          }).join('')}
        </nav>
        <div class="dh-cp-footer">
          <p class="dh-cp-quote">"A home is not just a place, it's a better tomorrow."</p>
        </div>
      </div>`;
  }

  function renderSidebar() {
    renderPortalSidebar();
    const summaryEl = document.getElementById('dream-project-summary');
    if (summaryEl && window.PortalSummary) {
      window.PortalSummary.render(summaryEl, {
        setupState,
        landSiteState,
        requirementsState,
        workflowStep: currentStep,
        projectId: window._ohiseeLinkedProjectId,
      });
    }
  }

  function render() {
    const area = document.getElementById('intent-question-area');
    if (!area) return;

    if (currentStep > 3 && !window._ohiseeLinkedProjectId) {
      currentStep = 1;
      updateUrl();
    }

    const scrollY = window.scrollY;
    if (window.ProjectSetupForm?.destroyMap) window.ProjectSetupForm.destroyMap();

    area.innerHTML = `
      <div class="dh-wizard-card">
        ${stepper()}
        <div class="dh-wizard-body">${renderBody()}</div>
        ${renderNav()}
      </div>`;

    if (currentStep === 1) bindStep1();
    else if (currentStep === 2) bindStep2();
    else if (currentStep === 3) bindStep3();
    else if (currentStep === 4) mountDesignWorkspace();

    document.getElementById('dh-btn-back')?.addEventListener('click', goBack);
    document.getElementById('dh-btn-draft')?.addEventListener('click', saveDraftClick);
    document.getElementById('dh-btn-next')?.addEventListener('click', goNext);
    renderSidebar();
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
  }

  function showPortalBar() {
    if (new URLSearchParams(window.location.search).get('portal') !== '1') return;
    const pid = window._ohiseeLinkedProjectId || '';
    const bar = document.createElement('div');
    bar.className = 'cp-portal-bar';
    bar.innerHTML = `<a href="customer-portal.html?view=workflow&step=${currentStep}&projectId=${encodeURIComponent(pid)}">&#8592; Back to Customer Portal</a>`;
    document.querySelector('.dh-wizard-card')?.prepend(bar);
  }

  async function init() {
    if (!window._intentAnswers) window._intentAnswers = {};
    const params = new URLSearchParams(window.location.search);
    const isFresh = params.get('new') === '1' || params.get('fresh') === '1';
    const urlProjectId = params.get('projectId');
    const urlStep = Math.min(STEPS.length, Math.max(1, parseInt(params.get('step') || '1', 10) || 1));

    if (!window.ProjectSetupModel) { console.error('ProjectSetupModel not loaded'); return; }

    if (isFresh) {
      clearWizardState();
      currentStep = 1;
      if (urlProjectId) {
        params.delete('projectId');
        params.delete('new');
        window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
      }
    } else if (urlProjectId) {
      window._ohiseeLinkedProjectId = urlProjectId;
      projectSavedOnServer = true;
      setupState = window.ProjectSetupModel.fromAnswers(window._intentAnswers);
      const loaded = await loadProjectFromServer(urlProjectId);
      currentStep = loaded
        ? Math.min(STEPS.length, Math.max(1, parseInt(loaded.workflow_step || urlStep, 10) || urlStep))
        : urlStep;
    } else {
      currentStep = urlStep;
      setupState = window.ProjectSetupModel.fromAnswers(window._intentAnswers);
      loadDraft({ restoreProjectId: false, restoreStep: urlStep > 1 });
      if (!window._ohiseeLinkedProjectId) {
        if (urlStep === 1) currentStep = 1;
        if (currentStep > 3) currentStep = 1;
      }
      window._ohiseeLinkedProjectId = null;
      projectSavedOnServer = false;
    }

    if (!setupState) setupState = window.ProjectSetupModel.defaults();
    if (!landSiteState && window.LandSiteModel) {
      landSiteState = window.LandSiteModel.fromStored({ projectSetup: setupState, landSite: answers().landSite });
    }
    if (!requirementsState && window.RequirementsStep) {
      requirementsState = window.RequirementsStep.defaults(setupState, landSiteState || {});
    }
    syncAnswers();
    updateUrl();
    render();
    showPortalBar();
  }

  window.IntentWizard = {
    init, render, saveDraft, saveDraftClick, renderSidebar, goNext, goBack,
    getSetupState: () => setupState,
    getCurrentStep: () => currentStep,
  };
})();
