
window.OrdersAPI = {
  create: async (data) => apiFetch('/orders', { method: 'POST', body: JSON.stringify(data) }),
  getAll: async () => apiFetch('/orders')
};
