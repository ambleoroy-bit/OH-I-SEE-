// ============================================================
// OH I SEE — Orders Frontend API client
// ============================================================

window.OrdersAPI = {
  create: async (data) => {
    return apiFetch('/orders', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    });
  },
  
  getAll: async () => {
    return apiFetch('/orders');
  },
  
  getAllAdmin: async () => {
    return apiFetch('/orders/all');
  },
  
  updateStatus: async (id, status) => {
    return apiFetch(`/orders/${id}/status`, { 
      method: 'PUT', 
      body: JSON.stringify({ status }) 
    });
  },
  
  getStats: async () => {
    return apiFetch('/orders/stats');
  }
};
