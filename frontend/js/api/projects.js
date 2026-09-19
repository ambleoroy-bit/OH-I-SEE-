// ============================================================
// OH I SEE — Projects API Client
// AI Construction Platform
// ============================================================

const PROJECTS_API_BASE = typeof resolveOhiseeApiBase === 'function'
  ? resolveOhiseeApiBase()
  : (window.OHISEE_API_BASE || '/api');

function getAuthHeader() {
  const token = typeof TokenStore !== 'undefined' ? TokenStore.get() : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function isAuthenticated() {
  const token = typeof TokenStore !== 'undefined' ? TokenStore.get() : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));
  return !!token;
}

const LOCAL_PROJECTS_KEY = 'ohisee_local_projects';

function readLocalProjects() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PROJECTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalProjects(list) {
  try {
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {}
}

const ProjectsAPI = {
  isAuthenticated,

  cacheLocally(project) {
    if (!project?.project_id) return;
    const list = readLocalProjects();
    const idx = list.findIndex((p) => p.project_id === project.project_id);
    if (idx >= 0) list[idx] = { ...list[idx], ...project };
    else list.unshift(project);
    writeLocalProjects(list);
    try {
      localStorage.setItem('ohisee_recent_project', JSON.stringify(project));
    } catch {}
  },

  getLocal(projectId) {
    const fromList = readLocalProjects().find((p) => p.project_id === projectId);
    if (fromList) return fromList;
    try {
      const recent = JSON.parse(localStorage.getItem('ohisee_recent_project') || 'null');
      if (recent?.project_id === projectId) return recent;
    } catch {}
    return null;
  },

  async getAll() {
    if (!isAuthenticated()) return { success: false, data: [], reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
      });
      if (resp.status === 401) return { success: false, data: [], reason: 'unauthenticated' };
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error('ProjectsAPI.getAll error:', err);
      return { success: false, data: [], reason: 'error', message: err.message };
    }
  },

  async getOne(projectId) {
    if (!isAuthenticated()) return { success: false, reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/${encodeURIComponent(projectId)}`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
      });
      if (resp.ok) {
        const payload = await resp.json();
        if (payload?.data) this.cacheLocally(payload.data);
        return payload;
      }
      const local = this.getLocal(projectId);
      if (local) return { success: true, data: local, source: 'localCache' };
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      const local = this.getLocal(projectId);
      if (local) return { success: true, data: local, source: 'localCache' };
      console.error('ProjectsAPI.getOne error:', err);
      return { success: false, reason: 'error', message: err.message };
    }
  },

  async create(projectData) {
    if (!isAuthenticated()) return { success: false, reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(projectData)
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      console.error('ProjectsAPI.create error:', err);
      return { success: false, reason: 'error', message: err.message };
    }
  },

  async update(projectId, updates) {
    if (!isAuthenticated()) return { success: false, reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(updates)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error('ProjectsAPI.update error:', err);
      return { success: false, reason: 'error', message: err.message };
    }
  },

  async getLeads(city) {
    if (!isAuthenticated()) return { success: false, data: [] };
    try {
      const qs = city ? `?city=${encodeURIComponent(city)}` : '';
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/leads/all${qs}`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
      });
      if (resp.status === 401) return { success: false, data: [], reason: 'unauthenticated' };
      if (resp.status === 403) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Contractor or vendor account required.');
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      const data = Array.isArray(payload) ? payload : (payload.data || []);
      return {
        success: true,
        data,
        source: payload.source || 'api',
        vendor_city: payload.vendor_city || payload.filter_city,
        filter_city: payload.filter_city || payload.vendor_city,
        filter_applied: payload.filter_applied,
        total_in_city: payload.total_in_city
      };
    } catch (err) {
      console.error('ProjectsAPI.getLeads error:', err);
      return { success: false, data: [], message: err.message };
    }
  },

  async acceptDeal(projectId, dealData) {
    if (!isAuthenticated()) return { success: false, reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/${projectId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(dealData)
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
      return payload;
    } catch (err) {
      console.error('ProjectsAPI.acceptDeal error:', err);
      return { success: false, reason: 'error', message: err.message };
    }
  },

  async getVendorAccepted() {
    if (!isAuthenticated()) return { success: false, data: [] };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/vendor/accepted`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      return { success: true, data: payload.data || [] };
    } catch (err) {
      console.error('ProjectsAPI.getVendorAccepted error:', err);
      return { success: false, data: [], message: err.message };
    }
  },

  async getEmployees(projectId) {
    if (!isAuthenticated()) return { success: false, data: [] };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/${projectId}/employees`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error('ProjectsAPI.getEmployees error:', err);
      return { success: false, data: [] };
    }
  },

  async assignEmployee(projectId, empData) {
    if (!isAuthenticated()) return { success: false, reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/${projectId}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(empData)
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      console.error('ProjectsAPI.assignEmployee error:', err);
      return { success: false, reason: 'error', message: err.message };
    }
  },

  async updateEmployee(projectId, empId, empData) {
    if (!isAuthenticated()) return { success: false, reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/${projectId}/employees/${empId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(empData)
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      console.error('ProjectsAPI.updateEmployee error:', err);
      return { success: false, reason: 'error', message: err.message };
    }
  },

  async removeEmployee(projectId, empId) {
    if (!isAuthenticated()) return { success: false, reason: 'unauthenticated' };
    try {
      const resp = await fetch(`${PROJECTS_API_BASE}/projects/${projectId}/employees/${empId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error('ProjectsAPI.removeEmployee error:', err);
      return { success: false, reason: 'error', message: err.message };
    }
  }
};

window.ProjectsAPI = ProjectsAPI;
