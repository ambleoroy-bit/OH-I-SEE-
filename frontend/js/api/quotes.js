
window.QuotesAPI = {
  submit: async (data) => apiFetch('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  getAll: async () => apiFetch('/quotes')
};
