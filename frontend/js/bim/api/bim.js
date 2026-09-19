// ============================================================
// OH I SEE — BIM API Client
// ============================================================

const BIM_API_BASE = typeof resolveOhiseeApiBase === 'function'
  ? resolveOhiseeApiBase()
  : (window.OHISEE_API_BASE || '/api');

function bimCacheKey(projectId) {
  return `ohisee_bim_${projectId}`;
}

function bimAuthHeader() {
  const token = typeof TokenStore !== 'undefined'
    ? TokenStore.get()
    : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function cacheBim(projectId, data) {
  if (!projectId || !data?.model) return;
  try {
    localStorage.setItem(bimCacheKey(projectId), JSON.stringify({
      model: data.model,
      version: data.version,
      validation: data.validation,
      quantities: data.quantities,
      requirements: data.requirements,
      status: data.status || 'ready',
      cachedAt: new Date().toISOString(),
    }));
  } catch (e) {}
}

function getCachedBim(projectId) {
  try {
    const raw = localStorage.getItem(bimCacheKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function mergeBimPayload(apiData, projectId) {
  const cached = getCachedBim(projectId);
  if (apiData?.model) {
    cacheBim(projectId, apiData);
    return apiData;
  }
  if (cached?.model) {
    return {
      ...apiData,
      model: cached.model,
      version: cached.version,
      validation: cached.validation,
      quantities: cached.quantities,
      status: cached.status || 'ready',
      source: 'localCache',
    };
  }
  return apiData;
}

const BimAPI = {
  cacheBim,
  getCachedBim,

  async getModel(projectId) {
    const resp = await fetch(`${BIM_API_BASE}/projects/${encodeURIComponent(projectId)}/bim`, {
      headers: { 'Content-Type': 'application/json', ...bimAuthHeader() },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
    if (payload.data) payload.data = mergeBimPayload(payload.data, projectId);
    return payload;
  },

  async modify(projectId, prompt, { project, bim } = {}) {
    const cachedBim = bim || getCachedBim(projectId);
    const projectSnapshot = project
      || (typeof ProjectsAPI !== 'undefined' ? ProjectsAPI.getLocal(projectId) : null);
    const resp = await fetch(`${BIM_API_BASE}/projects/${encodeURIComponent(projectId)}/bim/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bimAuthHeader() },
      body: JSON.stringify({
        prompt,
        project: projectSnapshot,
        bim: cachedBim?.model ? cachedBim : undefined,
      }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(payload.error || `HTTP ${resp.status}`);
      err.details = payload.details;
      throw err;
    }
    if (payload.data?.model) {
      cacheBim(projectId, { ...payload.data, status: 'ready' });
    }
    return payload;
  },

  async generate(projectId, body = {}) {
    const resp = await fetch(`${BIM_API_BASE}/projects/${encodeURIComponent(projectId)}/bim/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bimAuthHeader() },
      body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(payload.error || `HTTP ${resp.status}`);
      err.details = payload.details;
      throw err;
    }
    if (payload.data?.model) {
      cacheBim(projectId, { ...payload.data, status: 'ready' });
    }
    return payload;
  },

  applyGenerateResult(projectId, generatePayload) {
    const data = generatePayload?.data || generatePayload;
    if (!data?.model) return null;
    cacheBim(projectId, { ...data, status: 'ready' });
    return {
      model: data.model,
      version: data.version,
      validation: data.validation,
      quantities: data.quantities,
      status: 'ready',
      project: data.project,
    };
  },

  async validate(projectId) {
    const resp = await fetch(`${BIM_API_BASE}/projects/${encodeURIComponent(projectId)}/bim/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bimAuthHeader() },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
    return payload;
  },

  async getQuantities(projectId) {
    const resp = await fetch(`${BIM_API_BASE}/projects/${encodeURIComponent(projectId)}/bim/quantities`, {
      headers: { 'Content-Type': 'application/json', ...bimAuthHeader() },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
    return payload;
  },

  async getVersions(projectId) {
    const resp = await fetch(`${BIM_API_BASE}/projects/${encodeURIComponent(projectId)}/bim/versions`, {
      headers: { 'Content-Type': 'application/json', ...bimAuthHeader() },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
    return payload;
  },

  async getElement(projectId, elementId) {
    const resp = await fetch(
      `${BIM_API_BASE}/projects/${encodeURIComponent(projectId)}/bim/elements/${encodeURIComponent(elementId)}`,
      { headers: { 'Content-Type': 'application/json', ...bimAuthHeader() } }
    );
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
    return payload;
  },
};

window.BimAPI = BimAPI;
