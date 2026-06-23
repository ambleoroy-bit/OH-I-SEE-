// ============================================
// OH I SEE — Core Application JavaScript
// ============================================

// --- Product Catalog Synchronization (LocalStorage Override) ---
(function syncProducts() {
  if (typeof PRODUCTS !== 'undefined') {
    let custom = [];
    try {
      custom = JSON.parse(localStorage.getItem('ohisee_custom_products')) || [];
    } catch { custom = []; }

    let deleted = [];
    try {
      deleted = JSON.parse(localStorage.getItem('ohisee_deleted_products')) || [];
    } catch { deleted = []; }

    // Start with base products, filter out deleted, then override or add custom items
    let merged = PRODUCTS.filter(p => !deleted.includes(p.id));
    custom.forEach(item => {
      const idx = merged.findIndex(p => p.id === item.id);
      if (idx !== -1) {
        merged[idx] = item;
      } else {
        merged.push(item);
      }
    });

    window.PRODUCTS = merged;
  }
})();

// --- Partner Ecosystem Manager ---
const PartnerManager = {
  getDiscountPercentage(tier) {
    const discounts = {
      'Silver': 0.05,
      'Gold': 0.10,
      'Platinum': 0.15,
      'Diamond': 0.20
    };
    return discounts[tier] || 0;
  },

  getPartnerPrice(productPrice, user) {
    if (!user || user.role !== 'Partner' || user.partnerStatus !== 'approved') {
      return productPrice;
    }
    const discount = this.getDiscountPercentage(user.partnerTier || 'Silver');
    return Math.round(productPrice * (1 - discount));
  },

  getSavings(productPrice, user) {
    if (!user || user.role !== 'Partner' || user.partnerStatus !== 'approved') {
      return 0;
    }
    return productPrice - this.getPartnerPrice(productPrice, user);
  },

  getRewardPoints(purchaseAmount) {
    return Math.floor(purchaseAmount / 100);
  }
};

// --- RBAC & Session Management ---
const Security = {
  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('ohisee_user')) || null;
    } catch { return null; }
  },

  getCurrentRole() {
    const user = this.getCurrentUser();
    return user ? user.role : 'Customer';
  },

  hasPermission(action) {
    const role = this.getCurrentRole();
    
    const matrix = {
      'add_product': ['Super Admin', 'Admin'],
      'edit_product': ['Super Admin', 'Admin'],
      'delete_product': ['Super Admin', 'Admin'],
      'upload_images': ['Super Admin', 'Admin'],
      'manage_categories': ['Super Admin', 'Admin'],
      'manage_inventory': ['Super Admin', 'Admin'],
      'add_to_cart': ['Super Admin', 'Admin', 'Customer', 'Partner'],
      'request_quote': ['Super Admin', 'Admin', 'Customer', 'Partner']
    };

    if (matrix[action]) {
      return matrix[action].includes(role);
    }
    return false;
  },

  // Simulates backend API endpoint security checks
  validateApiAccess(action) {
    if (!this.hasPermission(action)) {
      throw {
        status: 403,
        message: "You do not have permission to manage products."
      };
    }
    return true;
  }
};

// --- Cart Management (LocalStorage) ---
const Cart = {
  KEY: 'ohisee_cart',

  getItems() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch { return []; }
  },

  saveItems(items) {
    localStorage.setItem(this.KEY, JSON.stringify(items));
    this.updateUI();
  },

  addItem(productId, qty = 1) {
    const user = Security.getCurrentUser();
    if (!user) {
      showGuestRestrictionPopup();
      return false;
    }
    const items = this.getItems();
    const existing = items.find(i => i.id === productId);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({ id: productId, qty });
    }
    this.saveItems(items);
    showToast('Product added to cart', 'success');
    return true;
  },

  removeItem(productId) {
    const items = this.getItems().filter(i => i.id !== productId);
    this.saveItems(items);
    showToast('Product removed from cart');
  },

  updateQty(productId, qty) {
    const items = this.getItems();
    const item = items.find(i => i.id === productId);
    if (item) {
      item.qty = Math.max(1, qty);
      this.saveItems(items);
    }
  },

  getCount() {
    return this.getItems().reduce((sum, i) => sum + i.qty, 0);
  },

  getTotal() {
    const items = this.getItems();
    const user = Security.getCurrentUser();
    return items.reduce((sum, item) => {
      const product = PRODUCTS.find(p => p.id === item.id);
      if (!product) return sum;
      const price = typeof PartnerManager !== 'undefined' ? PartnerManager.getPartnerPrice(product.price, user) : product.price;
      return sum + (price * item.qty);
    }, 0);
  },

  clear() {
    localStorage.removeItem(this.KEY);
    this.updateUI();
  },

  updateUI() {
    document.querySelectorAll('.cart-count').forEach(el => {
      const count = this.getCount();
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  }
};

// --- Wishlist Management ---
const Wishlist = {
  KEY: 'ohisee_wishlist',

  getItems() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch { return []; }
  },

  toggle(productId) {
    let items = this.getItems();
    if (items.includes(productId)) {
      items = items.filter(id => id !== productId);
      showToast('Removed from wishlist');
    } else {
      items.push(productId);
      showToast('Added to wishlist', 'success');
    }
    localStorage.setItem(this.KEY, JSON.stringify(items));
    this.updateUI();
  },

  isInWishlist(productId) {
    return this.getItems().includes(productId);
  },

  updateUI() {
    document.querySelectorAll('.wishlist-count').forEach(el => {
      el.textContent = this.getItems().length;
    });
  }
};

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Guest User Restriction Modal ---
function showGuestRestrictionPopup() {
  let overlay = document.querySelector('#guest-restriction-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'guest-restriction-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 420px; text-align: center; padding: 24px; background:#fff; border-radius:12px;">
        <div style="font-size: 64px; margin-bottom: 16px;">👤</div>
        <h3 style="font-family:'Space Grotesk',monospace; font-size:22px; text-transform:uppercase; margin-bottom:12px;">Authentication Required</h3>
        <p style="color:#666; font-size:14px; margin-bottom:24px; line-height:1.6;">Please create an account or login to continue.</p>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <a href="login.html" class="btn btn-primary" style="padding:12px 0; color:#000;">Log In</a>
          <a href="login.html#register" class="btn btn-outline-dark" style="padding:12px 0; border-color:#000;" onclick="closeGuestModal()">Register New Account</a>
          <button class="btn btn-outline" style="border-color:#ccc; color:#666; padding:10px 0; width:100%;" onclick="closeGuestModal()">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
}

function closeGuestModal() {
  const overlay = document.querySelector('#guest-restriction-overlay');
  if (overlay) overlay.classList.remove('active');
}

// --- Page Loader ---
function initLoader() {
  const loader = document.querySelector('.page-loader');
  if (loader) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        loader.classList.add('hidden');
      }, 800);
    });
  }
}

// --- Mobile Navigation ---
function initMobileNav() {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const overlay = document.querySelector('.mobile-nav-overlay');
  const closeBtn = document.querySelector('.mobile-nav-close');

  if (toggle && overlay) {
    toggle.addEventListener('click', () => overlay.classList.add('active'));
    closeBtn?.addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  }
}

// --- Search Functionality ---
function initSearch() {
  const searchInputs = document.querySelectorAll('.search-input');
  searchInputs.forEach(input => {
    let dropdown = input.parentElement.querySelector('.search-dropdown');
    
    input.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (query.length < 2) {
        if (dropdown) dropdown.style.display = 'none';
        return;
      }

      const results = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : [])
        .filter(p => p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query) || p.brand.toLowerCase().includes(query))
        .slice(0, 6);

      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'search-dropdown';
        dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:white;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.12);z-index:100;margin-top:4px;overflow:hidden;';
        input.parentElement.appendChild(dropdown);
      }

      if (results.length === 0) {
        dropdown.innerHTML = '<div style="padding:16px;color:#999;font-size:14px;">No products found</div>';
      } else {
        dropdown.innerHTML = results.map(p => `
          <a href="product-detail.html?id=${p.id}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f0f0f0;transition:background 0.15s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
            <img src="${p.image}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" alt="${p.name}">
            <div>
              <div style="font-size:13px;font-weight:600;color:#111;">${p.name}</div>
              <div style="font-size:12px;color:#999;">${p.brand} · ₹${p.price.toLocaleString('en-IN')}</div>
            </div>
          </a>
        `).join('');
      }
      dropdown.style.display = 'block';
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (dropdown) dropdown.style.display = 'none';
      }, 200);
    });
  });
}

// --- Quantity Selectors ---
function initQuantitySelectors() {
  document.querySelectorAll('.quantity-selector').forEach(selector => {
    const minusBtn = selector.querySelector('.qty-minus');
    const plusBtn = selector.querySelector('.qty-plus');
    const input = selector.querySelector('.qty-input');

    if (minusBtn && plusBtn && input) {
      minusBtn.addEventListener('click', () => {
        const val = parseInt(input.value) || 1;
        input.value = Math.max(1, val - 1);
        input.dispatchEvent(new Event('change'));
      });
      plusBtn.addEventListener('click', () => {
        const val = parseInt(input.value) || 1;
        input.value = val + 1;
        input.dispatchEvent(new Event('change'));
      });
    }
  });
}

// --- Product Card Rendering ---
function renderProductCard(product) {
  const badgeClass = product.stock === 'instock' || product.stock === 'active' ? 'badge-instock' :
    product.stock === 'limited' ? 'badge-limited' : 'badge-outofstock';

  const badgeText = product.stock === 'instock' || product.stock === 'active' ? 'In Stock' :
    product.stock === 'limited' ? 'Limited' : 'Out of Stock';

  const user = Security.getCurrentUser();
  const isPartner = user && user.role === 'Partner' && user.partnerStatus === 'approved';

  let pricingHtml = '';
  let badgesHtml = `<span class="product-card-badge ${badgeClass}">${badgeText}</span>`;
  let partnerPointsHtml = '';

  if (isPartner) {
    const partnerPrice = PartnerManager.getPartnerPrice(product.price, user);
    const savings = product.price - partnerPrice;
    const tier = user.partnerTier || 'Silver';
    const discountPct = Math.round(PartnerManager.getDiscountPercentage(tier) * 100);
    const points = PartnerManager.getRewardPoints(partnerPrice);

    pricingHtml = `
      <div>
        <div class="product-card-price-label" style="color:#000; font-weight:700; font-size:11px;">Partner Price (${tier})</div>
        <div class="product-card-price" style="font-size:16px; color:#00A651;">₹${partnerPrice.toLocaleString('en-IN')}</div>
        <div style="font-size:11px; color:#999; text-decoration:line-through;">Reg: ₹${product.price.toLocaleString('en-IN')}</div>
      </div>
      <div style="text-align: right;">
        <span style="background:#000; color:#FFD400; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; font-family:'Space Grotesk',monospace;">-${discountPct}%</span>
        <div style="font-size:11px; color:#00A651; font-weight:600; margin-top:2px;">Save ₹${savings.toLocaleString('en-IN')}</div>
      </div>
    `;

    partnerPointsHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#777; margin-bottom:8px; border-bottom: 1px dashed #eee; padding-bottom: 4px;">
        <span>Reward Points:</span>
        <strong style="color:#000;">+${points} Points</strong>
      </div>
    `;

    // Badges: Free Delivery & Insurance Eligible
    badgesHtml += `
      <span class="product-card-badge" style="background:#000; color:#FFD400; top:36px; font-size:9px; font-weight:700; border:1px solid #FFD400; padding: 2px 6px; text-transform: uppercase;">🚚 Free Delivery</span>
      <span class="product-card-badge" style="background:#00A651; color:#fff; top:64px; font-size:9px; font-weight:700; padding: 2px 6px; text-transform: uppercase;">🛡️ Insured SKU</span>
    `;
  } else {
    pricingHtml = `
      <div>
        <div class="product-card-price-label">Price/Unit</div>
        <div class="product-card-price" style="font-size:16px;">₹${product.price.toLocaleString('en-IN')}</div>
      </div>
    `;
  }

  return `
    <div class="product-card" data-id="${product.id}" data-category="${product.category}" data-brand="${product.brand}" data-price="${product.price}">
      <div class="product-card-image">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        ${badgesHtml}
      </div>
      <div class="product-card-body" style="padding: 16px;">
        <div class="product-card-brand">${product.brand} · ${product.category}</div>
        <a href="product-detail.html?id=${product.id}" class="product-card-name" style="font-size: 14px; font-weight:700; height: 38px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-transform:uppercase; margin-bottom:8px;">${product.name}</a>
        
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#555; margin-bottom:8px; border-bottom:1px solid #f0f0f0; padding-bottom:6px;">
          <span>Qty Available:</span>
          <strong style="font-family:'Space Grotesk',monospace; color: ${product.stockQty > 20 ? 'var(--success)' : 'var(--warning)'};">${product.stockQty} Units</strong>
        </div>
        
        ${partnerPointsHtml}
        
        <div class="product-card-pricing" style="border-top:none; padding-top:0; margin-top:0; display:flex; justify-content:space-between; align-items:center;">
          ${pricingHtml}
          <button class="product-card-cart-btn" onclick="Cart.addItem(${product.id})" title="Add to Cart" style="background:var(--primary); color:#000;">🛒</button>
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:12px;">
          <a href="product-detail.html?id=${product.id}" class="btn btn-outline-dark btn-sm text-center" style="font-size:10px; padding:6px 0; border-color:#ccc; display:block; line-height:1.2;">View Details</a>
          <button class="btn btn-primary btn-sm text-center" onclick="requestQuoteClick(${product.id})" style="font-size:10px; padding:6px 0; color:#000; display:block; line-height:1.2;">Request Quote</button>
        </div>
      </div>
    </div>
  `;
}

// Global quote button helper
window.requestQuoteClick = function(productId) {
  const user = Security.getCurrentUser();
  if (!user) {
    showGuestRestrictionPopup();
    return;
  }
  window.location.href = `bulk-quote.html?id=${productId}`;
}

// --- Quick View Modal ---
function openQuickView(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  let overlay = document.querySelector('.modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal"><div class="modal-header"><h3>Quick View</h3><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"></div></div>';
    document.body.appendChild(overlay);
  }

  const body = overlay.querySelector('.modal-body');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div style="aspect-ratio:1;background:#f5f5f5;border-radius:12px;overflow:hidden;">
        <img src="${product.image}" alt="${product.name}" style="width:100%;height:100%;object-fit:cover;">
      </div>
      <div>
        <div style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">${product.brand}</div>
        <h2 style="font-family:'Space Grotesk',monospace;font-size:22px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">${product.name}</h2>
        <div style="font-size:13px;color:#999;margin-bottom:16px;">SKU: ${product.sku}</div>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin-bottom:16px;">
          <span style="font-family:'Space Grotesk',monospace;font-size:32px;font-weight:700;">₹${product.price.toLocaleString('en-IN')}</span>
          ${product.originalPrice ? `<span style="font-size:16px;color:#999;text-decoration:line-through;margin-left:12px;">₹${product.originalPrice.toLocaleString('en-IN')}</span>` : ''}
        </div>
        <p style="font-size:14px;color:#555;line-height:1.7;margin-bottom:16px;">${product.description}</p>
        <div style="display:flex;gap:12px;">
          <button class="btn btn-primary" onclick="Cart.addItem(${product.id});closeModal();">Add to Cart</button>
          <a href="product-detail.html?id=${product.id}" class="btn btn-outline-dark">View Details</a>
        </div>
      </div>
    </div>
  `;

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// --- Format Currency ---
function formatPrice(amount) {
  return '₹' + amount.toLocaleString('en-IN');
}

// --- URL Params ---
function getUrlParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

// --- Catalog Tabs ---
function initCatalogTabs() {
  const tabs = document.querySelectorAll('.catalog-tab');
  const grid = document.querySelector('.catalog-product-grid');
  if (!tabs.length || !grid) return;

  const categories = {
    'best-sellers': () => PRODUCTS.filter(p => p.badge === 'bestseller').slice(0, 8),
    'new-arrivals': () => PRODUCTS.slice().reverse().slice(0, 8),
    'top-rated': () => PRODUCTS.filter(p => p.stock === 'instock').slice(0, 8),
    'special-offers': () => PRODUCTS.filter(p => p.originalPrice && p.originalPrice > p.price).slice(0, 8)
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.dataset.tab;
      const products = categories[key] ? categories[key]() : PRODUCTS.slice(0, 8);
      grid.innerHTML = products.map(renderProductCard).join('');
    });
  });

  // Trigger first tab
  if (tabs[0]) tabs[0].click();
}

// --- View Toggle ---
function initViewToggle() {
  const gridBtn = document.querySelector('.view-grid');
  const listBtn = document.querySelector('.view-list');
  const grid = document.querySelector('.product-grid');

  if (gridBtn && listBtn && grid) {
    gridBtn.addEventListener('click', () => {
      grid.classList.remove('list-view');
      gridBtn.classList.add('active');
      listBtn.classList.remove('active');
    });
    listBtn.addEventListener('click', () => {
      grid.classList.add('list-view');
      listBtn.classList.add('active');
      gridBtn.classList.remove('active');
    });
  }
}

// --- Dashboard Tabs ---
function initDashboardTabs() {
  const navLinks = document.querySelectorAll('.dashboard-nav a');
  const sections = document.querySelectorAll('.dashboard-content-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      sections.forEach(s => {
        s.classList.remove('active');
        if (s.id === target) s.classList.add('active');
      });
    });
  });
}

// --- Login Tabs ---
function initLoginTabs() {
  const tabs = document.querySelectorAll('.login-tab');
  const forms = document.querySelectorAll('.login-form-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.form;
      forms.forEach(f => {
        f.classList.remove('active');
        if (f.id === target) f.classList.add('active');
      });
    });
  });

  // Check if hash matches register to auto select registration tab
  if (window.location.hash === '#register') {
    const regTab = document.querySelector('.login-tab[data-form="register-panel"]');
    if (regTab) regTab.click();
  }
}

// --- Admin Tabs ---
function initAdminTabs() {
  const navLinks = document.querySelectorAll('.admin-nav a');
  const sections = document.querySelectorAll('.admin-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      sections.forEach(s => {
        s.classList.remove('active');
        if (s.id === target) s.classList.add('active');
      });
    });
  });
}

// --- Toggle Switch ---
function initToggleSwitches() {
  document.querySelectorAll('.toggle-switch').forEach(toggle => {
    toggle.addEventListener('click', () => toggle.classList.toggle('active'));
  });
}

// --- Payment Method Selection ---
function initPaymentMethods() {
  document.querySelectorAll('.payment-method').forEach(method => {
    method.addEventListener('click', () => {
      document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
      method.classList.add('selected');
    });
  });
}

// --- Bulk Quote Steps ---
function initBulkQuoteSteps() {
  const steps = document.querySelectorAll('.quote-step-panel');
  const bars = document.querySelectorAll('.step-bar');
  let currentStep = 0;

  window.nextQuoteStep = function() {
    if (currentStep < steps.length - 1) {
      steps[currentStep].style.display = 'none';
      currentStep++;
      steps[currentStep].style.display = 'block';
      updateStepBars();
    }
  };

  window.prevQuoteStep = function() {
    if (currentStep > 0) {
      steps[currentStep].style.display = 'none';
      currentStep--;
      steps[currentStep].style.display = 'block';
      updateStepBars();
    }
  };

  function updateStepBars() {
    bars.forEach((bar, i) => {
      bar.classList.remove('filled', 'half');
      if (i < currentStep) bar.classList.add('filled');
      else if (i === currentStep) bar.classList.add('half');
    });
    const indicator = document.querySelector('.step-indicator');
    if (indicator) indicator.textContent = `Step ${currentStep + 1} of ${steps.length}`;
  }
}

// --- Scroll Effects ---
function initScrollEffects() {
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
      } else {
        header.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }
    });
  }
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initMobileNav();
  initSearch();
  initQuantitySelectors();
  initCatalogTabs();
  initViewToggle();
  initDashboardTabs();
  initLoginTabs();
  initAdminTabs();
  initToggleSwitches();
  initPaymentMethods();
  initBulkQuoteSteps();
  initScrollEffects();

  // Update cart/wishlist counts
  Cart.updateUI();
  Wishlist.updateUI();

  // Close modal on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});
