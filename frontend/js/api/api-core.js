// ============================================================
// OH I SEE — Frontend API Service
// Calls the Node.js/Express backend at /api/*
// ============================================================

const API_BASE = 'http://localhost:3001/api';

// ── Token Storage ─────────────────────────────────────────
const TokenStore = {
  get() { return localStorage.getItem('ohisee_jwt') || null; },
  set(token) { localStorage.setItem('ohisee_jwt', token); },
  clear() { localStorage.removeItem('ohisee_jwt'); localStorage.removeItem('ohisee_user_cache'); }
};

// ── User Cache ────────────────────────────────────────────
const UserCache = {
  get() {
    try { return JSON.parse(localStorage.getItem('ohisee_user_cache')) || null; }
    catch { return null; }
  },
  set(user) { localStorage.setItem('ohisee_user_cache', JSON.stringify(user)); },
  clear() { localStorage.removeItem('ohisee_user_cache'); }
};

// ── Core Fetch Wrapper ────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = TokenStore.get();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error('Backend Server Offline or CORS Configuration Error');
    }
    throw error;
  }

  const data = await response.json();

  if (!response.ok) {
    const message = data.error || data.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

window.ApiService = {
  post: async (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) }),
  get: async (path) => apiFetch(path)
};

console.log("✓ ApiService Loaded");
