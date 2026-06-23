
window.ProductsAPI = {
  getAll: async () => apiFetch('/products'),
  getById: async (id) => apiFetch(`/products/${id}`)
};
