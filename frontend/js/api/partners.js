
window.PartnersAPI = {
  getStats: async () => apiFetch('/partners/stats'),
  getAll: async () => apiFetch('/partners')
};
