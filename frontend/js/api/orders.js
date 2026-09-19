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
    const res = await apiFetch('/orders');
    return Array.isArray(res) ? res : (res.orders || res.data || []);
  },
  
  getMyOrders: async () => {
    const res = await apiFetch('/orders');
    return Array.isArray(res) ? res : (res.orders || res.data || []);
  },
  
  getAllAdmin: async () => {
    const res = await apiFetch('/orders/all');
    return Array.isArray(res) ? res : (res.orders || res.data || []);
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
