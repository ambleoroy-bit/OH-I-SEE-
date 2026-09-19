// ============================================================
// OH I SEE — Shared Frontend Utilities
// ============================================================

function getUrlParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'info', duration = 3500) {
  const existing = document.getElementById('ohisee-toast');
  if (existing) existing.remove();

  const colors = {
    success: '#00A651',
    error:   '#E53935',
    warning: '#FF9800',
    info:    '#FFD400'
  };

  const toast = document.createElement('div');
  toast.id = 'ohisee-toast';
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(20px);
    background: #111; color: #fff; padding: 12px 20px; border-radius: 8px;
    font-size: 14px; font-family: 'Inter', sans-serif;
    border-left: 4px solid ${colors[type] || colors.info};
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 99999;
    opacity: 0; transition: all 0.3s ease; white-space: nowrap; max-width: 90vw;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

window.getUrlParam = getUrlParam;
window.escHtml = escHtml;
window.formatPrice = formatPrice;
window.formatDate = formatDate;
window.showToast = showToast;