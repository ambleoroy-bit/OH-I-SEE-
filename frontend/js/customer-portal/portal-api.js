// OH I SEE — Customer Portal API client
(function (root) {
  'use strict';

  function apiBase() {
    if (typeof resolveOhiseeApiBase === 'function') return resolveOhiseeApiBase();
    return '/api';
  }

  function authHeaders() {
    const token = typeof TokenStore !== 'undefined' ? TokenStore.get()
      : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function request(path, options = {}) {
    const resp = await fetch(`${apiBase()}/portal${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
    return data;
  }

  const PortalAPI = {
    getDashboard: () => request('/dashboard'),
    getProjects: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/projects${q ? `?${q}` : ''}`);
    },
    getSummary: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/summary`),
    updateWorkflow: (projectId, workflowStep) => request(`/projects/${encodeURIComponent(projectId)}/workflow`, {
      method: 'PUT', body: JSON.stringify({ workflow_step: workflowStep }),
    }),
    getMilestones: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/milestones`),
    getSiteUpdates: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/site-updates`),
    getMessages: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/messages`),
    sendMessage: (projectId, body) => request(`/projects/${encodeURIComponent(projectId)}/messages`, {
      method: 'POST', body: JSON.stringify(body),
    }),
    getPayments: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/payments`),
    getMaterialOrders: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/material-orders`),
    getQuotes: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/quotes`),
    selectBuilder: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/quotes/select`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    shortlistQuote: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/quotes/shortlist`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    decideBudgetApproval: (projectId, approvalId, decision) => request(`/projects/${encodeURIComponent(projectId)}/budget-approvals/${encodeURIComponent(approvalId)}`, {
      method: 'PUT', body: JSON.stringify({ decision }),
    }),
    getApprovals: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/approvals`),
    submitApproval: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/approvals`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    getDesigns: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/designs`),
    createDesignVersion: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/designs`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    saveDesignState: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/design-state`, {
      method: 'PUT', body: JSON.stringify(payload),
    }),
    approveDesign: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/design-approval`, {
      method: 'PUT', body: JSON.stringify(payload),
    }),
    saveDraft: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/draft`, {
      method: 'PUT', body: JSON.stringify(payload),
    }),
    deleteProject: (projectId) => request(`/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    }),
    getHandover: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/handover`),
    getMaintenance: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/maintenance`),
    createMaintenance: (projectId, payload) => request(`/projects/${encodeURIComponent(projectId)}/maintenance`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    getSupportTickets: () => request('/support-tickets'),
    createSupportTicket: (payload) => request('/support-tickets', {
      method: 'POST', body: JSON.stringify(payload),
    }),
  };

  root.PortalAPI = PortalAPI;
})(typeof window !== 'undefined' ? window : global);
