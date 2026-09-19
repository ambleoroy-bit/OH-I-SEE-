// ============================================================
// OH I SEE — Frontend API Service
// Calls the Node.js/Express backend at /api/*
// ============================================================

function resolveApiBase() {
  if (window.OHISEE_API_BASE) return window.OHISEE_API_BASE;
  const rt = window.OHISEE_RUNTIME || {};
  if (rt.API_BASE) return rt.API_BASE.replace(/\/$/, '');
  const host = location.hostname;
  const port = location.port;
  if (host === 'localhost' || host === '127.0.0.1') {
    // Vite on :3000 proxies /api → backend. Avoid localhost:3001 (IPv6 may hit stray Vite).
    if (port === '3000' || port === '5173') return '/api';
    return 'http://127.0.0.1:3001/api';
  }
  return '/api';
}

const API_BASE = resolveApiBase();
window.resolveOhiseeApiBase = resolveApiBase;

// ── Token Storage ─────────────────────────────────────────
const TokenStore = {
  get() {
    return localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token') || sessionStorage.getItem('ohisee_token') || null;
  },
  set(token) {
    if (token) {
      localStorage.setItem('ohisee_jwt', token);
      localStorage.setItem('ohisee_token', token);
    }
  },
  clear() {
    localStorage.removeItem('ohisee_jwt');
    localStorage.removeItem('ohisee_token');
    sessionStorage.removeItem('ohisee_token');
    localStorage.removeItem('ohisee_user_cache');
    window._ohiseeUser = null;
    window._ohiseeSession = null;
  }
};

function safeSetStorage(storage, key, val) {
  if (!storage || !key) return;
  try {
    const stringified = typeof val === 'string' ? val : JSON.stringify(val);
    storage.setItem(key, stringified);
  } catch (err) {
    console.warn(`Storage quota exceeded for ${key}, stripping heavy payload properties:`, err.message);
    try {
      if (typeof val === 'object' && val !== null) {
        const copy = JSON.parse(JSON.stringify(val));
        function stripLargeStrings(obj) {
          if (!obj || typeof obj !== 'object') return;
          for (const k in obj) {
            if (typeof obj[k] === 'string' && obj[k].length > 200) {
              if (k.includes('image') || k.includes('logo') || k.includes('photo') || k.includes('avatar') || obj[k].startsWith('data:')) {
                obj[k] = '';
              }
            } else if (typeof obj[k] === 'object') {
              stripLargeStrings(obj[k]);
            }
          }
        }
        stripLargeStrings(copy);
        storage.setItem(key, JSON.stringify(copy));
      }
    } catch (_) {}
  }
}
window.safeSetStorage = safeSetStorage;

// ── User Cache ────────────────────────────────────────────
const UserCache = {
  get() {
    try {
      const cached = JSON.parse(localStorage.getItem('ohisee_user_cache')) || null;
      if (cached) window._ohiseeUser = cached;
      return cached;
    } catch { return window._ohiseeUser || null; }
  },
  set(user) {
    if (user) {
      window._ohiseeUser = user;
      safeSetStorage(localStorage, 'ohisee_user_cache', user);
    }
  },
  clear() {
    localStorage.removeItem('ohisee_user_cache');
    window._ohiseeUser = null;
  }
};
window.UserCache = UserCache;

async function parseApiResponse(response) {
  const raw = await response.text();
  if (!raw || !raw.trim()) {
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('API not reachable. Ensure the backend is running on port 3001 and open the site at http://127.0.0.1:3000');
      }
      throw new Error(`Server returned an empty response (HTTP ${response.status}).`);
    }
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Server returned an invalid response. Restart the backend API and use http://127.0.0.1:3000 for the site.');
  }
}

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
      throw new Error('Backend server offline. Start it with: cd backend && node src/server.js');
    }
    throw error;
  }

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const message = data.error || data.message || `Request failed (${response.status})`;
    if (data.hint) {
      const err = new Error(message);
      err.hint = data.hint;
      throw err;
    }
    throw new Error(message);
  }

  return data;
}

window.ApiService = {
  post: async (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) }),
  get: async (path) => apiFetch(path)
};

console.log('✓ ApiService Loaded →', API_BASE);
