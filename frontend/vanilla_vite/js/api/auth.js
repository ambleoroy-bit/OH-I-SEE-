window.AuthAPI = {
  signup: async (name, email, password, phone, role) => {
    console.log("✓ Request Sent: signup", email);
    const res = await apiFetch('/auth/signup', { 
      method: 'POST', 
      body: JSON.stringify({ name, email, password, phone, role }) 
    });
    console.log("✓ Response Received:", res);
    if (res.token) {
      TokenStore.set(res.token);
      UserCache.set(res.user);
      console.log("SESSION_CREATED", res.user?.id);
    }
    return res;
  },

  login: async (email, password) => {
    console.log("✓ Request Sent: login", email);
    try {
      const res = await apiFetch('/auth/login', { 
        method: 'POST', 
        body: JSON.stringify({ email, password }) 
      });
      console.log("LOGIN_SUCCESS", res.user?.email);
      if (res.token) {
        TokenStore.set(res.token);
        UserCache.set(res.user);
        console.log("SESSION_CREATED", res.user?.id);
      }
      return res;
    } catch (err) {
      console.log("LOGIN_FAILED:", err.message);
      throw err;
    }
  },

  logout: async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch(e) {}
    TokenStore.clear();
    UserCache.clear();
    window.location.href = 'login.html';
  },

  forgotPassword: async (email) => {
    return apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  },

  verifyResetToken: async (token) => {
    return apiFetch(`/auth/verify-reset-token/${token}`);
  },

  resetPassword: async (token, password, confirmPassword) => {
    return apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password, confirmPassword }) });
  },

  restoreSession: async () => {
    const token = TokenStore.get();
    if (!token) return null;
    try {
      const data = await apiFetch('/auth/me');
      console.log("PROFILE_FOUND", data.user?.id);
      UserCache.set(data.user);
      return data.user;
    } catch (err) {
      console.log("PROFILE_MISSING");
      TokenStore.clear();
      UserCache.clear();
      return null;
    }
  },

  requireAuth: async (allowedRoles = []) => {
    const user = await window.AuthAPI.restoreSession();
    if (!user) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return null;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      alert("You do not have permission to access this page.");
      window.location.href = 'index.html';
      return null;
    }
    return user;
  },

  redirectByRole: (role) => {
    console.log("REDIRECT_TRIGGERED", role);
    switch (role) {
      case 'Admin':
      case 'Super Admin':
        window.location.href = 'admin.html';
        break;
      case 'Partner':
        window.location.href = 'partner.html';
        break;
      default:
        window.location.href = 'account.html';
    }
  }
};
console.log("✓ AuthAPI Loaded");
