
window.UsersAPI = {
  getProfile: async () => apiFetch('/users/me'),
  getStats: async () => apiFetch('/users/stats')
};
