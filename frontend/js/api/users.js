
window.UsersAPI = {
  getProfile: async () => apiFetch('/users/me'),
  getStats: async () => apiFetch('/users/stats'),
  updateMe: async (payload) => {
    const res = await apiFetch('/users/me', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    const user = res.user || res.data || res;
    if (user?.id) UserCache.set(user);
    return user;
  }
};
