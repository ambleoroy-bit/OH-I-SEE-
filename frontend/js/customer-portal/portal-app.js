// OH I SEE — Customer Portal application router

(function () {

  'use strict';



  const C = () => window.CustomerPortalConstants;

  const S = () => window.PortalSections;

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');



  let state = {

    view: 'dashboard',

    projectId: null,

    workflowStep: 1,

    filters: { status: 'all', q: '' },

    saveStatus: 'idle',

  };



  let saveStatusTimer = null;

  let navigatingAway = false;



  function params() {

    return new URLSearchParams(window.location.search);

  }



  function setSaveStatus(s, detail) {

    state.saveStatus = s;

    const el = document.getElementById('cp-save-status');

    if (!el) return;



    const labels = {

      idle: '',

      saving: 'Saving...',

      saved: '✓ Saved just now',

      unsaved: 'Unsaved changes',

      error: '⚠ Save failed',

    };

    el.textContent = detail || labels[s] || '';

    el.className = `cp-save-status${s ? ` ${s}` : ''}`;



    clearTimeout(saveStatusTimer);

    if (s === 'saved') {

      saveStatusTimer = setTimeout(() => {

        if (state.saveStatus === 'saved') setSaveStatus('idle');

      }, 5000);

    }

  }



  function renderStepper() {

    const wrap = document.getElementById('cp-stepper');

    if (!wrap) return;

    const steps = C().WORKFLOW_STEPS;

    const cur = state.workflowStep || 1;

    const maxAllowed = state.projectId ? 8 : 1;

    const pct = typeof PortalCompletion !== 'undefined'

      ? PortalCompletion.projectCompletionPercent({ workflowStep: cur, status: 'draft' })

      : Math.round(((cur - 1) / 8) * 100);



    wrap.innerHTML = `

      <div class="cp-stepper-meta">

        <span class="cp-kicker">STEP ${cur} OF 8</span>

        <span class="cp-stepper-title">${esc(steps[cur - 1]?.label || '')}</span>

        <span class="cp-stepper-pct">${pct}% complete</span>

      </div>

      <div class="cp-stepper-track" role="navigation" aria-label="Project workflow">

        ${steps.map((s) => {

          const done = s.n < cur;

          const current = s.n === cur;

          const disabled = s.n > maxAllowed && !done;

          const href = disabled ? '#' : buildUrl({ view: 'workflow', step: String(s.n), projectId: state.projectId });

          return `<a class="cp-step ${done ? 'done' : ''} ${current ? 'current' : ''} ${disabled ? 'disabled' : ''}"

            href="${href}" data-step="${s.n}" ${disabled ? 'aria-disabled="true"' : ''}>

            <span class="cp-step-num">${done ? '&#10003;' : s.n}</span>

            <span class="cp-step-label">${esc(s.label)}</span>

          </a>`;

        }).join('')}

      </div>`;

    wrap.querySelectorAll('.cp-step:not(.disabled)').forEach((a) => {

      a.addEventListener('click', (e) => {

        if (a.classList.contains('disabled')) e.preventDefault();

      });

    });

  }



  const LOCKED_NAV = new Set(['quotes', 'materials', 'payments', 'messages', 'site-updates', 'handover']);

  let cachedProject = null;

  async function ensureProject() {
    const PC = window.PortalProjectContext;
    if (!state.projectId || !PC) return null;
    if (cachedProject?.project_id === state.projectId) return cachedProject;
    const loaded = await PC.loadProject(state.projectId);
    if (loaded.ok) cachedProject = loaded.project;
    return cachedProject || null;
  }

  function renderSidebar(project) {

    const nav = document.getElementById('cp-nav');

    if (!nav) return;

    const items = C().NAV_ITEMS;

    const activeId = state.view === 'workflow' && state.workflowStep <= 3 ? 'new-project' : state.view;

    const PC = window.PortalProjectContext;

    nav.innerHTML = items.map((item) => {

      let locked = false;
      if (LOCKED_NAV.has(item.id) && project && PC) {
        const access = PC.sectionAccess(project, item.id);
        locked = !access.available;
      } else if (LOCKED_NAV.has(item.id) && !state.projectId) {
        locked = true;
      }

      const classes = [
        'cp-nav-link',
        activeId === item.id ? 'active' : '',
        locked ? 'locked' : '',
      ].filter(Boolean).join(' ');

      const href = item.externalHref || buildUrl({ view: item.id, projectId: state.projectId });

      return `

      <a class="${classes}" href="${href}" data-cp-nav="${item.id}" ${locked ? 'title="Select a project or complete earlier steps"' : ''}>

        <span class="cp-nav-icon" aria-hidden="true">${item.icon}</span>

        <span>${esc(item.label)}</span>

        ${locked ? '<span class="cp-nav-lock" aria-hidden="true">&#128274;</span>' : ''}

      </a>`;

    }).join('');

  }



  function buildUrl(overrides = {}) {

    const p = new URLSearchParams();

    const view = overrides.view || state.view;

    p.set('view', view);

    const pid = overrides.projectId !== undefined ? overrides.projectId : state.projectId;

    if (pid) p.set('projectId', pid);

    if (view === 'workflow' || overrides.step) {

      p.set('step', String(overrides.step || state.workflowStep || 1));

    }

    return `customer-portal.html?${p}`;

  }



  async function renderMain() {

    const mount = document.getElementById('cp-main');

    const stepper = document.getElementById('cp-stepper-wrap');

    if (!mount) return;



    const workflowViews = ['workflow', 'new-project'];

    if (stepper) stepper.hidden = !workflowViews.includes(state.view);



    if (state.view === 'workflow') renderStepper();



    const ctx = {

      mount,

      view: state.view,

      projectId: state.projectId,

      workflowStep: state.workflowStep,

      filters: state.filters,

      onFilter: (f) => { state.filters = { ...state.filters, ...f }; navigate(buildUrl({ view: 'projects' })); },

    };



    switch (state.view) {

      case 'dashboard': await S().renderDashboard(ctx); break;

      case 'drafts': await S().renderDrafts(ctx); break;

      case 'projects': await S().renderProjects(ctx); break;

      case 'quotes': await S().renderQuotes(ctx); break;

      case 'materials': await S().renderMaterials(ctx); break;

      case 'payments': await S().renderPayments(ctx); break;

      case 'messages': await S().renderMessages(ctx); break;

      case 'site-updates': await S().renderSiteUpdates(ctx); break;

      case 'handover': await S().renderHandover(ctx); break;

      case 'profile': await S().renderProfile(ctx); break;

      case 'support': await S().renderSupport(ctx); break;

      case 'workflow': await S().renderWorkflowStep(ctx); break;

      default: await S().renderDashboard(ctx);

    }



    await S().renderSummarySidebar(document.getElementById('cp-summary'), state.projectId, state.workflowStep);

  }



  function renderUser() {

    const user = typeof UserCache !== 'undefined' ? UserCache.get() : null;

    const nameEl = document.getElementById('cp-user-name');

    const avatarEl = document.getElementById('cp-user-avatar');

    if (nameEl) nameEl.textContent = user?.name || user?.email || 'Customer';

    if (avatarEl) {

      const initials = (user?.name || user?.email || 'C').slice(0, 1).toUpperCase();

      avatarEl.textContent = initials;

    }

  }



  async function navigateAway(url) {

    if (navigatingAway) return;

    if (state.view === 'workflow' && state.workflowStep <= 3 && state.saveStatus === 'unsaved') {

      const leave = window.confirm('You have unsaved changes. Leave without saving?');

      if (!leave) return;

    }

    if (state.view === 'workflow' && typeof PortalWorkflow?.flushAutoSave === 'function') {

      try { await PortalWorkflow.flushAutoSave(); } catch { /* user chose to leave */ }

    }

    navigatingAway = true;

    window.location.href = url;

  }



  function navigate(url) {

    navigateAway(url);

  }



  function requireAuth() {

    const token = typeof TokenStore !== 'undefined' ? TokenStore.get()

      : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));

    if (!token) {

      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;

      return false;

    }

    return true;

  }



  function wireChrome() {

    document.getElementById('cp-sidebar-toggle')?.addEventListener('click', () => {

      document.body.classList.toggle('cp-sidebar-open');

    });



    const saveBtn = document.getElementById('cp-save-draft');

    if (saveBtn) {

      saveBtn.addEventListener('click', async () => {

        if (saveBtn.disabled) return;

        saveBtn.disabled = true;

        try {

          if (state.view === 'workflow') {
            if (state.workflowStep <= 3 && typeof PortalWorkflow?.saveDraftClick === 'function') {
              const result = await PortalWorkflow.saveDraftClick();
              const pid = result?.projectId || PortalWorkflow.getProjectId();
              if (pid && pid !== state.projectId) {
                state.projectId = pid;
                try { sessionStorage.setItem('ohisee_active_draft_project_id', pid); } catch { /* ignore */ }
                navigate(buildUrl({ view: 'workflow', step: String(state.workflowStep), projectId: pid }));
                return;
              }
              setSaveStatus('saved');
              return;
            }

            const footerDraft = document.getElementById('de-save-draft')
              || document.getElementById('cp-step-save-draft')
              || document.getElementById('cp-wizard-draft');
            if (footerDraft) {
              footerDraft.click();
              setSaveStatus('saved');
              return;
            }

            const pid = state.projectId
              || (typeof PortalWorkflow !== 'undefined' ? PortalWorkflow.getProjectId?.() : null)
              || window._ohiseeLinkedProjectId;
            if (pid && typeof PortalAPI !== 'undefined' && PortalAPI.saveDraft) {
              await PortalAPI.saveDraft(pid, { workflow_step: state.workflowStep, wizardStep: state.workflowStep });
              setSaveStatus('saved');
              return;
            }

            setSaveStatus('error', '⚠ Open a project workflow to save');
            return;
          }

          setSaveStatus('error', '⚠ Open a project workflow to save');

        } catch (err) {

          setSaveStatus('error', err.message || '⚠ Unable to save draft');

        } finally {

          saveBtn.disabled = false;

        }

      });

    }



    document.querySelectorAll('a[href*="customer-portal.html"]').forEach((link) => {

      link.addEventListener('click', (e) => {

        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const href = link.getAttribute('href');

        if (!href || href.startsWith('#')) return;

        if (state.saveStatus !== 'unsaved') return;

        e.preventDefault();

        navigateAway(href);

      });

    });



    window.addEventListener('beforeunload', (e) => {

      if (state.saveStatus === 'unsaved') {

        e.preventDefault();

        e.returnValue = '';

      }

    });

  }



  async function init() {

    if (!requireAuth()) return;

    if (typeof restoreSession === 'function') await restoreSession().catch(() => {});



    const p = params();

    state.view = p.get('view') || 'dashboard';

    if (state.view === 'new-project') {
      window.location.replace(C().NEW_PROJECT_HREF || 'intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1');
      return;
    }

    state.projectId = (typeof PortalProjectContext !== 'undefined'
      ? PortalProjectContext.resolveProjectId(p.get('projectId'))
      : p.get('projectId')) || null;

    state.workflowStep = Math.min(8, Math.max(1, parseInt(p.get('step') || '1', 10) || 1));

    if (state.projectId && !p.get('projectId')) {
      const u = new URL(window.location.href);
      u.searchParams.set('projectId', state.projectId);
      window.history.replaceState({}, '', u);
    }



    renderUser();

    wireChrome();

    setSaveStatus('idle');

    cachedProject = await ensureProject();

    renderSidebar(cachedProject);

    await renderMain();

  }



  document.addEventListener('DOMContentLoaded', init);

  function syncWorkflowStep(step) {
    state.workflowStep = Math.min(8, Math.max(1, parseInt(step, 10) || 1));
    renderStepper();
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('step', String(state.workflowStep));
      window.history.replaceState({}, '', u);
    } catch { /* ignore */ }
  }

  window.CustomerPortalApp = { init, buildUrl, getState: () => state, setSaveStatus, navigate, syncWorkflowStep };

  window.PortalApp = window.CustomerPortalApp;

})();


