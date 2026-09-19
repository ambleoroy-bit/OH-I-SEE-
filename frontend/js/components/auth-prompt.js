// OH I SEE — Auth Prompt Modal Component for Project Creation
(function (root) {
  'use strict';

  function createModalDOM() {
    if (document.getElementById('auth-prompt-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'auth-prompt-modal';
    modal.className = 'auth-prompt-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="auth-prompt-card">
        <button type="button" class="auth-prompt-close" id="auth-prompt-close-btn" aria-label="Close">✕</button>
        <div class="auth-prompt-badge">PROJECT CREATION</div>
        <h3 class="auth-prompt-title">Sign Up or Log In to Create Your Project</h3>
        <p class="auth-prompt-sub">
          Please log in or create a free OH I SEE account to save your project details, access AI design reports, and connect with verified regional builders.
        </p>

        <div class="auth-prompt-actions">
          <div class="auth-prompt-btn-card signup-card" id="auth-prompt-signup-btn" role="button" tabindex="0">
            <span class="auth-prompt-btn-icon">✨</span>
            <div class="auth-prompt-btn-text">
              <strong>Create Free Account (Sign Up)</strong>
              <span>New to OH I SEE? Register in 30 seconds as Homeowner or Buyer</span>
            </div>
            <span class="auth-prompt-btn-arrow">→</span>
          </div>

          <div class="auth-prompt-btn-card login-card" id="auth-prompt-login-btn" role="button" tabindex="0">
            <span class="auth-prompt-btn-icon">🔑</span>
            <div class="auth-prompt-btn-text">
              <strong>Log In to Existing Account</strong>
              <span>Already have an account? Sign in to save and manage your project</span>
            </div>
            <span class="auth-prompt-btn-arrow">→</span>
          </div>
        </div>

        <div class="auth-prompt-footer">
          🔒 Your draft inputs will be saved and restored automatically after logging in or signing up.
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('auth-prompt-close-btn')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  function showAuthPromptModal(options = {}) {
    createModalDOM();
    const modal = document.getElementById('auth-prompt-modal');
    if (!modal) return;

    const redirectUrl = options.redirectUrl || window.location.href;

    const signupBtn = document.getElementById('auth-prompt-signup-btn');
    const loginBtn = document.getElementById('auth-prompt-login-btn');

    if (signupBtn) {
      signupBtn.onclick = () => {
        if (typeof options.onBeforeRedirect === 'function') {
          try { options.onBeforeRedirect(); } catch (e) {}
        }
        const target = `login.html?tab=register&reason=create_project&redirect=${encodeURIComponent(redirectUrl)}`;
        window.location.href = target;
      };
    }

    if (loginBtn) {
      loginBtn.onclick = () => {
        if (typeof options.onBeforeRedirect === 'function') {
          try { options.onBeforeRedirect(); } catch (e) {}
        }
        const target = `login.html?tab=login&reason=create_project&redirect=${encodeURIComponent(redirectUrl)}`;
        window.location.href = target;
      };
    }

    modal.style.display = 'flex';
  }

  root.AuthPrompt = {
    show: showAuthPromptModal,
  };
})(typeof window !== 'undefined' ? window : global);
