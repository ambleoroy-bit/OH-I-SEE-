// OH I SEE — Customer Portal section renderers
(function (root) {
  'use strict';

  const C = () => root.CustomerPortalConstants;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  const INR = '\u20B9';

  function fmtDate(d) {
    if (!d) return 'Not specified';
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  function fmtMoney(n) {
    const v = parseFloat(String(n).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(v) || v <= 0) return 'Not specified';
    return `${INR}${v.toLocaleString('en-IN')}`;
  }

  function emptyState(msg, actionHtml = '') {
    return `<div class="cp-empty"><p>${esc(msg)}</p>${actionHtml}</div>`;
  }

  function workflowUrl(step, projectId) {
    const params = new URLSearchParams({ view: 'workflow', step: String(step) });
    if (projectId) params.set('projectId', projectId);
    return `customer-portal.html?${params}`;
  }

  function workflowNavFooter(prevStep, nextStep, projectId, nextLabel = 'Continue \u2192') {
    const prevHref = prevStep ? workflowUrl(prevStep, projectId) : '';
    const nextHref = nextStep ? workflowUrl(nextStep, projectId) : '';
    return `
      <div class="form-actions dh-nav-footer cp-workflow-nav">
        ${prevStep ? `<a class="form-actions__prev form-actions__prev--link" href="${prevHref}">\u2190 Previous</a>` : '<span class="form-actions__spacer" aria-hidden="true"></span>'}
        <button type="button" class="form-actions__draft" id="cp-step-save-draft">Save as Draft</button>
        ${nextStep ? `<a class="form-actions__next form-actions__next--link" href="${nextHref}">${esc(nextLabel)}</a>` : '<span class="form-actions__spacer" aria-hidden="true"></span>'}
      </div>`;
  }

  async function saveWorkflowDraft(projectId) {
    if (typeof PortalWorkflow?.saveDraftClick === 'function') {
      const ws = PortalWorkflow.getWizardState?.();
      if (ws?.currentStep) {
        await PortalWorkflow.saveDraftClick();
        return;
      }
    }
    const deDraft = document.getElementById('de-save-draft');
    if (deDraft) {
      deDraft.click();
      return;
    }
    const pid = projectId
      || (typeof PortalWorkflow !== 'undefined' ? PortalWorkflow.getProjectId?.() : null)
      || window._ohiseeLinkedProjectId
      || (() => { try { return sessionStorage.getItem('ohisee_active_draft_project_id'); } catch { return null; } })();
    if (!pid) throw new Error('Complete Project Setup first to create your project.');
    const step = Math.min(8, Math.max(1, parseInt(new URLSearchParams(window.location.search).get('step') || '1', 10) || 1));
    await PortalAPI.saveDraft(pid, { workflow_step: step, wizardStep: step });
  }

  function wireWorkflowNav(projectId) {
    document.getElementById('cp-step-save-draft')?.addEventListener('click', async () => {
      try {
        await saveWorkflowDraft(projectId);
        PortalApp?.setSaveStatus('saved');
      } catch (err) {
        PortalApp?.setSaveStatus('error', err.message || '⚠ Unable to save draft');
      }
    });
  }

  async function withProjectSection(state, sectionId, renderFn) {
    const el = state.mount;
    const PC = root.PortalProjectContext;
    const pid = PC?.resolveProjectId(state.projectId);
    state.projectId = pid;

    if (!pid) {
      el.innerHTML = PC?.noProjectHtml() || emptyState('Open a project from My Projects.', '<a class="cp-btn" href="customer-portal.html?view=projects">My Projects</a>');
      return;
    }

    el.innerHTML = '<div class="cp-loading">Loading project...</div>';
    const loaded = await PC.loadProject(pid);
    if (!loaded.ok) {
      el.innerHTML = emptyState(loaded.message || 'Project not found.', '<a class="cp-btn" href="customer-portal.html?view=projects">My Projects</a>');
      return;
    }

    const access = PC.sectionAccess(loaded.project, sectionId);
    if (!access.available) {
      el.innerHTML = PC.lockedHtml(access, pid);
      return;
    }

    await renderFn(el, state, loaded.project);
  }

  async function renderDashboard(state) {
    if (root.PortalModules?.renderDashboardPage) {
      return root.PortalModules.renderDashboardPage(state.mount, state);
    }
    const el = state.mount;
    el.innerHTML = emptyState('Dashboard module not loaded.');
  }

  function statusClass(status) {
    const s = String(status || 'draft').toLowerCase();
    if (s === 'draft') return 'draft';
    if (s === 'completed') return 'completed';
    return 'active';
  }

  function lastSavedLabel(p) {
    const PC = root.PortalCompletion;
    const iso = p.last_saved_at || p.updated_at;
    return PC ? PC.formatRelativeTime(iso) : fmtDate(iso);
  }

  function draftResumeUrl(p) {
    const step = Math.min(3, Math.max(1, parseInt(p.workflow_step, 10) || 1));
    const params = new URLSearchParams({
      intent: 'NEW_HOME',
      step: String(step),
      portal: '1',
      projectId: p.project_id,
    });
    return `intent-engine.html?${params}`;
  }

  function projectCardHtml(p, { showDelete = true, resumeHref } = {}) {
    const step = p.workflow_step || 1;
    const pct = p.completion_percentage ?? p.progress_pct ?? 0;
    const isDraft = String(p.status || '').toLowerCase() === 'draft';
    const stepLabel = p.workflow_step_label || `Step ${step}`;
    const continueLabel = isDraft ? 'Continue Draft' : 'Open Project';
    const continueUrl = resumeHref || (isDraft
      ? draftResumeUrl(p)
      : workflowUrl(step, p.project_id));

    return `<article class="cp-project-card cp-project-card--${statusClass(p.status)}">
      <div class="cp-project-card-head">
        <h3>${esc(p.project_name || 'Untitled')}</h3>
        <span class="cp-badge cp-badge-${statusClass(p.status)}">${esc(p.status_label || p.status || 'Draft')}</span>
      </div>
      <p class="cp-project-card-sub">${esc(p.project_type || 'Project')} &middot; ${esc(p.location || 'Location not set')}</p>
      <ul class="cp-meta-list">
        <li><strong>Current step:</strong> ${esc(stepLabel)}</li>
        <li><strong>Completion:</strong> ${pct}%</li>
        <li><strong>Last saved:</strong> ${esc(lastSavedLabel(p))}</li>
        <li><strong>Created:</strong> ${fmtDate(p.created_at)}</li>
        ${p.budget ? `<li><strong>Budget:</strong> ${fmtMoney(p.budget)}</li>` : ''}
      </ul>
      <div class="cp-project-card-actions">
        <a class="cp-btn cp-btn-primary" href="${continueUrl}">${continueLabel}</a>
        <a class="cp-btn" href="project-overview.html?projectId=${encodeURIComponent(p.project_id)}">View Project</a>
        ${showDelete && isDraft ? `<button type="button" class="cp-btn cp-btn-danger" data-delete-draft="${esc(p.project_id)}">Delete Draft</button>` : ''}
      </div>
    </article>`;
  }

  function wireProjectCardActions(container, state) {
    container?.querySelectorAll('[data-delete-draft]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.deleteDraft;
        if (!id) return;
        if (!window.confirm('Delete this draft project? This cannot be undone.')) return;
        btn.disabled = true;
        try {
          await PortalAPI.deleteProject(id);
          if (state.projectId === id) {
            try { sessionStorage.removeItem('ohisee_active_draft_project_id'); } catch { /* ignore */ }
          }
          if (state.view === 'drafts') await renderDrafts(state);
          else await renderProjects(state);
        } catch (err) {
          alert(err.message || 'Could not delete draft.');
          btn.disabled = false;
        }
      });
    });
  }

  async function renderDrafts(state) {
    state.view = 'drafts';
    const el = state.mount;
    el.innerHTML = '<div class="cp-loading">Loading drafts...</div>';
    try {
      const { data } = await PortalAPI.getProjects({ status: 'draft' });
      const drafts = (data || []).filter((p) => String(p.status || '').toLowerCase() === 'draft');
      el.innerHTML = `
        <div class="cp-page-header">
          <h1>Drafts</h1>
          <p>Incomplete projects saved for later. Continue where you left off or start fresh.</p>
        </div>
        <div class="cp-toolbar">
          <a class="cp-btn cp-btn-primary" href="${C().NEW_PROJECT_HREF || 'intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1'}">+ Start New Project</a>
        </div>
        <div class="cp-project-grid" id="cp-drafts-grid">
          ${drafts.length
            ? drafts.map((p) => projectCardHtml(p, { resumeHref: draftResumeUrl(p) })).join('')
            : emptyState('No draft projects yet.', `<a class="cp-btn cp-btn-primary" href="${C().NEW_PROJECT_HREF || 'intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1'}">Start Project Setup</a>`)}
        </div>`;
      wireProjectCardActions(document.getElementById('cp-drafts-grid'), state);
    } catch (err) {
      el.innerHTML = emptyState(err.message);
    }
  }

  async function renderProjects(state) {
    state.view = 'projects';
    const el = state.mount;
    const status = state.filters?.status || 'all';
    const q = state.filters?.q || '';
    el.innerHTML = '<div class="cp-loading">Loading projects...</div>';
    try {
      const { data } = await PortalAPI.getProjects({ status: status === 'all' ? '' : status, q });
      const projects = data || [];
      el.innerHTML = `
        <div class="cp-page-header">
          <h1>My Projects</h1>
          <p>All construction projects linked to your account</p>
        </div>
        <div class="cp-toolbar">
          <input type="search" id="cp-project-search" class="cp-input" placeholder="Search projects..." value="${esc(q)}">
          <select id="cp-project-filter" class="cp-select">
            ${C().PROJECT_STATUS_FILTERS.map((s) => {
              const val = s.toLowerCase();
              return `<option value="${val}" ${status === val ? 'selected' : ''}>${esc(s)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="cp-project-grid" id="cp-projects-grid">
          ${projects.length ? projects.map((p) => projectCardHtml(p)).join('') : emptyState('No projects match your filters.', `<a class="cp-btn cp-btn-primary" href="${C().NEW_PROJECT_HREF || 'intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1'}">Create New Project</a>`)}
        </div>`;
      const grid = document.getElementById('cp-projects-grid');
      wireProjectCardActions(grid, state);
      document.getElementById('cp-project-search')?.addEventListener('change', (e) => {
        state.onFilter?.({ q: e.target.value, status });
      });
      document.getElementById('cp-project-filter')?.addEventListener('change', (e) => {
        state.onFilter?.({ q, status: e.target.value });
      });
    } catch (err) {
      el.innerHTML = emptyState(err.message);
    }
  }

  function renderNewProject(state) {
    const href = C().NEW_PROJECT_HREF || 'intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1';
    state.mount.innerHTML = `
      <div class="cp-page-header">
        <h1>New Project</h1>
        <p>Start with Step 1 — Project Setup</p>
      </div>
      <div class="cp-section">
        <p>Create a new construction project. Incomplete work is saved to <a href="customer-portal.html?view=drafts">Drafts</a>.</p>
        <a class="cp-btn cp-btn-primary" href="${href}">Start Project Setup</a>
      </div>`;
  }

  async function renderQuotes(state) {
    const M = root.PortalModules;
    if (!M) return;
    await withProjectSection(state, 'quotes', (el, s, project) => M.renderQuotesPage(el, s, project));
  }

  async function renderMaterials(state) {
    const M = root.PortalModules;
    if (!M) return;
    await withProjectSection(state, 'materials', (el, s, project) => M.renderMaterialsPage(el, s, project));
  }

  async function renderPayments(state) {
    const M = root.PortalModules;
    if (!M) return;
    await withProjectSection(state, 'payments', (el, s, project) => M.renderPaymentsPage(el, s, project));
  }

  async function renderMessages(state) {
    const M = root.PortalModules;
    if (!M) return;
    await withProjectSection(state, 'messages', (el, s, project) => M.renderMessagesPage(el, s, project));
  }

  async function renderSiteUpdates(state) {
    const M = root.PortalModules;
    if (!M) return;
    await withProjectSection(state, 'site-updates', (el, s, project) => M.renderSiteUpdatesPage(el, s, project));
  }

  async function renderHandover(state) {
    const M = root.PortalModules;
    if (!M) return;
    await withProjectSection(state, 'handover', (el, s, project) => M.renderHandoverPage(el, s, project));
  }

  async function renderProfile(state) {
    const user = typeof UserCache !== 'undefined' ? UserCache.get() : null;
    state.mount.innerHTML = `
      <div class="cp-page-header"><h1>My Profile</h1></div>
      <form class="cp-form ps-form" id="cp-profile-form">
        <div class="ps-grid ps-grid-2">
          <div class="ps-field"><label>Full Name</label><input data-profile="name" value="${esc(user?.name || '')}"></div>
          <div class="ps-field"><label>Email</label><input data-profile="email" type="email" value="${esc(user?.email || '')}" readonly></div>
          <div class="ps-field"><label>Phone</label><input data-profile="phone" value="${esc(user?.phone || '')}"></div>
          <div class="ps-field"><label>City</label><input data-profile="city" value="${esc(user?.city || '')}"></div>
        </div>
        <a class="cp-btn" href="account.html">Full Account Settings</a>
      </form>`;
  }

  async function renderSupport(state) {
    state.mount.innerHTML = `
      <div class="cp-page-header"><h1>Support</h1></div>
      <form id="cp-support-form" class="cp-form">
        <div class="ps-field"><label>Category</label>
          <select id="cp-ticket-category" class="cp-select">
            <option value="construction">Construction Expert</option>
            <option value="technical">Technical Support</option>
            <option value="payment">Payment Support</option>
            <option value="builder">Builder Support</option>
            <option value="material">Material Support</option>
          </select>
        </div>
        <div class="ps-field"><label>Subject</label><input id="cp-ticket-subject" class="cp-input"></div>
        <div class="ps-field"><label>Description</label><textarea id="cp-ticket-desc" rows="4"></textarea></div>
        <button type="submit" class="cp-btn cp-btn-primary">Raise Support Ticket</button>
      </form>
      <div id="cp-tickets-list" class="cp-section" style="margin-top:24px"></div>`;
    const list = document.getElementById('cp-tickets-list');
    try {
      const { data } = await PortalAPI.getSupportTickets();
      list.innerHTML = data.length ? data.map((t) => `<div class="cp-ticket"><strong>${esc(t.ticket_ref)}</strong> — ${esc(t.subject)} <span class="cp-badge">${esc(t.status)}</span></div>`).join('') : '<p class="cp-empty">No tickets yet.</p>';
    } catch { list.innerHTML = ''; }
    document.getElementById('cp-support-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await PortalAPI.createSupportTicket({
        project_id: state.projectId,
        category: document.getElementById('cp-ticket-category').value,
        subject: document.getElementById('cp-ticket-subject').value,
        description: document.getElementById('cp-ticket-desc').value,
      });
      renderSupport(state);
    });
  }

  async function renderWorkflowStep(state) {
    const step = state.workflowStep || 1;
    const pid = state.projectId;
    const el = state.mount;

    if (step <= 3) {
      if (typeof PortalWorkflow !== 'undefined') {
        PortalWorkflow.destroy?.();
        el.innerHTML = '<div id="cp-workflow-root"></div>';
        const root = document.getElementById('cp-workflow-root');
        let freshStart = false;
        try {
          freshStart = sessionStorage.getItem('ohisee_fresh_wizard') === '1';
          if (freshStart) sessionStorage.removeItem('ohisee_fresh_wizard');
        } catch { /* ignore */ }
        await PortalWorkflow.init(root, {
          step,
          projectId: pid,
          reuseActiveDraft: !pid && !freshStart,
          freshStart,
          onComplete: (nextStep, newPid) => {
            const url = workflowUrl(nextStep, newPid || pid);
            window.location.href = url;
          },
        });
        const ws = PortalWorkflow.getWizardState?.();
        const activeStep = ws?.currentStep || step;
        state.workflowStep = activeStep;
        if (typeof CustomerPortalApp !== 'undefined' && CustomerPortalApp.syncWorkflowStep) {
          CustomerPortalApp.syncWorkflowStep(activeStep);
        }
        if (typeof PortalSummary !== 'undefined') {
          PortalSummary.render(document.getElementById('cp-summary'), {
            workflowStep: activeStep,
            projectId: ws?.projectId || pid,
            setupState: ws?.setupState,
            landSiteState: ws?.landSiteState,
            requirementsState: ws?.requirementsState,
          });
        }
        return;
      }
      el.innerHTML = emptyState('Workflow scripts not loaded. Please refresh the page.');
      return;
    }

    if (step === 4) {
      if (!state.projectId) {
        try {
          state.projectId = sessionStorage.getItem('ohisee_active_draft_project_id')
            || window._ohiseeLinkedProjectId || null;
        } catch { /* ignore */ }
      }
      return renderDesignWorkspace(state);
    }
    if (step === 5) return renderQuotes(state);
    if (step === 6) return renderApprovals(state);
    if (step === 7) return renderExecution(state);
    if (step === 8) return renderHandoverMaintenance(state);
  }

  async function renderDesignWorkspace(state) {
    const el = state.mount;
    const pid = state.projectId
      || (typeof PortalWorkflow !== 'undefined' ? PortalWorkflow.getProjectId?.() : null)
      || window._ohiseeLinkedProjectId
      || (() => { try { return sessionStorage.getItem('ohisee_active_draft_project_id'); } catch { return null; } })();
    if (!pid) {
      el.innerHTML = `${emptyState('Save Project Setup first to generate designs.', `<a class="cp-btn" href="${workflowUrl(1)}">Go to Project Setup</a>`)}
        ${workflowNavFooter(3, null, null)}`;
      return;
    }
    state.projectId = pid;
    root.PortalProjectContext?.persistProjectId(pid);
    if (typeof DesignWorkspace === 'undefined') {
      el.innerHTML = emptyState('Design workspace failed to load. Hard refresh (Ctrl+Shift+R).');
      return;
    }
    el.innerHTML = '<div class="cp-wizard-embed dh-wizard-card" id="cp-design-root"></div>';
    await DesignWorkspace.mount(document.getElementById('cp-design-root'), {
      projectId: pid,
      previousHref: workflowUrl(3, pid),
    });
    if (typeof PortalSummary !== 'undefined') {
      PortalSummary.render(document.getElementById('cp-summary'), { workflowStep: 4, projectId: pid });
    }
  }

  async function renderApprovals(state) {
    if(!state.projectId){state.mount.innerHTML=emptyState('Select a project first.');return;}
    await MarketplaceUI.renderComparison(state.mount,state.projectId);
  }
  async function renderExecution(state) {
    if(!state.projectId){state.mount.innerHTML=emptyState('Select a project first.');return;}
    try {
      const {data:jobs}=await MarketplaceUI.api('/jobs');
      const job=jobs.find(j=>j.project_id===state.projectId&&['approved','in_execution'].includes(j.data.stage));
      if(!job){state.mount.innerHTML=emptyState('Approve a contractor budget in Builder Quotes before execution begins.');return;}
      await MarketplaceUI.renderJob(state.mount,job.id);
    } catch(e){state.mount.innerHTML=emptyState(e.message);}
  }
  async function renderHandoverMaintenance(state) { return renderExecution(state); }

  async function renderSummarySidebar(container, projectId, workflowStep = 1) {
    if (!container) return;

    const pid = projectId || (typeof PortalWorkflow !== 'undefined' ? PortalWorkflow.getProjectId?.() : null)
      || window._ohiseeLinkedProjectId || null;

    if(!pid){container.innerHTML='<p class="cp-hint">Select a project to view its details.</p>';return;}
    let apiSetup = null;
    if (pid) {
      try {
        const { data } = await PortalAPI.getSummary(pid);
        const ctx = data.construction_context || {};
        apiSetup = ctx.projectSetup || {
          project_name: data.project_name,
          project_type: data.project_type,
          floors: data.floors,
          city: data.city,
          state: data.state,
          estimated_budget: data.budget,
          start_date: data.start_date,
          target_completion_date: data.target_completion_date,
          facing_direction: data.facing,
        };
        workflowStep = data.workflow_step || workflowStep;
      } catch { container.innerHTML='<p class="cp-hint">Select a project from your account to view its summary.</p>'; return; }
    }

    if (typeof PortalSummary !== 'undefined') {
      PortalSummary.render(container, {
        projectId: pid,
        workflowStep,
        setupState: apiSetup,
      });
      return;
    }

    container.innerHTML = '<p class="cp-hint">Summary module not loaded.</p>';
  }

  root.PortalSections = {
    renderDashboard, renderDrafts, renderProjects, renderNewProject, renderQuotes, renderMaterials,
    renderPayments, renderMessages, renderSiteUpdates, renderHandover, renderProfile,
    renderSupport, renderWorkflowStep, renderSummarySidebar,
  };
})(typeof window !== 'undefined' ? window : global);
