// ============================================================
// OH I SEE — Quotes Frontend API client
// ============================================================

window.QuotesAPI = {
  submit: async (data) => {
    return apiFetch('/quotes', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    });
  },

  create: async (data) => {
    return apiFetch('/quotes', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    });
  },
  
  getAll: async () => {
    const res = await apiFetch('/quotes');
    return Array.isArray(res) ? res : (res.quotes || res.data || []);
  },

  getMyQuotes: async () => {
    const res = await apiFetch('/quotes');
    return Array.isArray(res) ? res : (res.quotes || res.data || []);
  },
  
  getAllAdmin: async () => {
    const res = await apiFetch('/quotes/all');
    return Array.isArray(res) ? res : (res.quotes || res.data || []);
  },
  
  updateStatus: async (id, status) => {
    return apiFetch(`/quotes/${id}/status`, { 
      method: 'PUT', 
      body: JSON.stringify({ status }) 
    });
  }
};
