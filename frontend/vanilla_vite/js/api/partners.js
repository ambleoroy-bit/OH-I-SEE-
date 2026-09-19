// ============================================================
// OH I SEE — Partners Frontend API client
// ============================================================

window.PartnersAPI = {
  getStats: async () => {
    return apiFetch('/partners/stats');
  },
  
  getAll: async () => {
    return apiFetch('/partners');
  },
  
  updateStatus: async (id, status) => {
    return apiFetch(`/partners/${id}/status`, { 
      method: 'PUT', 
      body: JSON.stringify({ status }) 
    });
  },
  
  updateTier: async (id, tier) => {
    return apiFetch(`/partners/${id}/tier`, { 
      method: 'PUT', 
      body: JSON.stringify({ tier }) 
    });
  }
};
