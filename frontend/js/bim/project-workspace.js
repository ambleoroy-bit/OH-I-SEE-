// ============================================================
// OH I SEE — Shared Project Workspace Shell
// ============================================================

const ProjectWorkspace = {
  MODULES: [
    { id: 'overview', title: 'Overview', icon: '📋', page: 'project-overview.html' },
    { id: 'floor-plan', title: 'Floor Plan', icon: '📐', page: 'project-floor-plan.html' },
    { id: '3d', title: '3D Home', icon: '🏠', page: 'project-3d.html' },
    { id: 'bim', title: 'BIM & Technical', icon: '🧱', page: 'project-bim.html' },
    { id: 'materials', title: 'Materials', icon: '🪨', page: 'project-materials.html' },
    { id: 'boq', title: 'Quantities / BOQ', icon: '📊', page: 'project-boq.html' },
    { id: 'cost', title: 'Cost Estimate', icon: '💰', page: 'project-cost.html' },
    { id: 'export', title: 'Export', icon: '📤', page: 'project-export.html' },
  ],

  getProjectId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('projectId') || params.get('id') || '';
  },

  pageUrl(page, projectId) {
    const id = projectId || this.getProjectId();
    return `${page}?projectId=${encodeURIComponent(id)}`;
  },

  requireAuth(projectId) {
    const token = typeof TokenStore !== 'undefined'
      ? TokenStore.get()
      : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));
    if (!token) {
      const page = window.location.pathname.split('/').pop() || 'project-overview.html';
      window.location.href = `login.html?redirect=${encodeURIComponent(`${page}?projectId=${projectId}`)}`;
      return false;
    }
    return true;
  },

  async loadProject(projectId) {
    if (typeof ProjectsAPI !== 'undefined') {
      const result = await ProjectsAPI.getOne(projectId);
      if (result?.data) {
        ProjectsAPI.cacheLocally(result.data);
        return result.data;
      }
      const local = ProjectsAPI.getLocal(projectId);
      if (local) return local;
    }
    const API = typeof resolveOhiseeApiBase === 'function' ? resolveOhiseeApiBase() : '/api';
    const token = typeof TokenStore !== 'undefined' ? TokenStore.get() : localStorage.getItem('ohisee_jwt');
    const resp = await fetch(`${API}/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const payload = await resp.json();
      if (payload?.data && typeof ProjectsAPI !== 'undefined') {
        ProjectsAPI.cacheLocally(payload.data);
      }
      return payload.data || null;
    }
    if (typeof ProjectsAPI !== 'undefined') {
      return ProjectsAPI.getLocal(projectId);
    }
    return null;
  },

  renderNav(activeId, projectId) {
    const nav = document.getElementById('pw-nav');
    if (!nav) return;
    const id = projectId || this.getProjectId();
    nav.innerHTML = `
      <div class="pw-nav-title">Project Workspace</div>
      ${this.MODULES.map((m) => `
        <a class="pw-nav-link${m.id === activeId ? ' active' : ''}"
           href="${this.pageUrl(m.page, id)}">
          <span class="pw-nav-icon">${m.icon}</span>
          <span>${m.title}</span>
        </a>
      `).join('')}
      <div style="margin-top:20px;padding:0 20px;">
        <a class="pw-back" href="project-detail.html?id=${encodeURIComponent(id)}">← Project Dashboard</a>
      </div>`;
  },

  renderTopbar(project, title, status) {
    const top = document.getElementById('pw-topbar');
    if (!top) return;
    const statusClass = {
      ready: 'pw-status-ready',
      generating: 'pw-status-pending',
      pending: 'pw-status-pending',
      failed: 'pw-status-failed',
    }[status] || 'pw-status-none';
    const statusLabel = status || 'none';
    top.innerHTML = `
      <div>
        <h1>${title}</h1>
        <div class="pw-project-id" style="margin-top:4px;">${project?.project_id || ''}</div>
      </div>
      <div class="pw-actions">
        <span class="pw-status-badge ${statusClass}">BIM ${statusLabel}</span>
        <button type="button" class="pw-btn pw-btn-primary" id="pw-generate-bim">Generate from client requirements</button>
        <button type="button" class="pw-btn" id="pw-validate-bim">Validate</button>
      </div>`;
  },

  bimStatusLabel(status) {
    const map = { none: 'Not generated', pending: 'Pending', generating: 'Generating…', ready: 'Ready', failed: 'Failed' };
    return map[status] || status || 'Unknown';
  },

  formatArea(m2) {
    if (!m2) return '—';
    const sqft = Math.round(m2 * 10.7639);
    return `${m2.toFixed(1)} m² (${sqft.toLocaleString('en-IN')} sq.ft)`;
  },

  wireBimActions(projectId, onUpdated) {
    document.getElementById('pw-generate-bim')?.addEventListener('click', async () => {
      const btn = document.getElementById('pw-generate-bim');
      if (!btn || typeof BimAPI === 'undefined') return;
      btn.disabled = true;
      btn.textContent = 'Generating…';
      try {
        const res = await BimAPI.generate(projectId);
        if (typeof Notifications !== 'undefined') {
          const msg = res.warning ? `BIM generated (${res.warning})` : 'BIM model generated.';
          Notifications.show(msg, res.warning ? 'warning' : 'success');
        }
        if (onUpdated) await onUpdated(res);
      } catch (e) {
        const msg = e.details?.length
          ? `${e.message} (${e.details.map((d) => d.message || d).join(', ')})`
          : e.message;
        if (typeof Notifications !== 'undefined') Notifications.show(msg, 'error');
        else alert(msg);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate from client requirements';
      }
    });

    document.getElementById('pw-validate-bim')?.addEventListener('click', async () => {
      if (typeof BimAPI === 'undefined') return;
      try {
        const result = await BimAPI.validate(projectId);
        const valid = result.data?.valid;
        const msg = valid ? 'BIM validation passed.' : `Validation issues: ${(result.data?.errors || []).join(', ')}`;
        if (typeof Notifications !== 'undefined') Notifications.show(msg, valid ? 'success' : 'warning');
        else alert(msg);
      } catch (e) {
        if (typeof Notifications !== 'undefined') Notifications.show(e.message, 'error');
      }
    });
  },
};

window.ProjectWorkspace = ProjectWorkspace;
