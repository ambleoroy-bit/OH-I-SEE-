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
  
  getAll: async () => {
    return apiFetch('/quotes');
  },
  
  getAllAdmin: async () => {
    return apiFetch('/quotes/all');
  },
  
  updateStatus: async (id, status) => {
    return apiFetch(`/quotes/${id}/status`, { 
      method: 'PUT', 
      body: JSON.stringify({ status }) 
    });
  }
};
