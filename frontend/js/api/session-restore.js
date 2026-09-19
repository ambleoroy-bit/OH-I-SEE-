// ============================================================
// AUTO-RESTORE SESSION on every page
// ============================================================
(async function autoRestoreSession() {
  if (location.pathname.includes('login.html')) return;

  const cached = UserCache.get();
  if (cached) {
    window._ohiseeUser = cached;
    // Dispatch event so pages can react immediately
    window.dispatchEvent(new CustomEvent('userSessionLoaded', { detail: cached }));
  }

  // Validate token in background using consolidated AuthAPI
  if (TokenStore.get()) {
    const user = await window.AuthAPI.restoreSession();
    if (user) {
      window._ohiseeUser = user;
      window.dispatchEvent(new CustomEvent('userSessionValidated', { detail: user }));
    }
  }
})();

// Cleaned up broken exports
