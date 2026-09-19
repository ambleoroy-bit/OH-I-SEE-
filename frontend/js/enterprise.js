// ============================================================
// OH I SEE — Enterprise Control Center Logic
// ============================================================

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3001/api' 
  : '/api';

function getAuthHeaders() {
  const token = typeof TokenStore !== 'undefined' ? TokenStore.get() : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token') || sessionStorage.getItem('ohisee_token'));
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

let starredModules = JSON.parse(localStorage.getItem('ohisee_starred_modules') || '[]');
let recentModules = JSON.parse(localStorage.getItem('ohisee_recent_modules') || '[]');

document.addEventListener('DOMContentLoaded', () => {
  initUserSession();
  fetchSummaryMetrics();
  bindModuleCards();
  bindSearch();
  bindNavigation();
  updateFavoritesUI();
  updateRecentUI();
});

// 1. User Session & Role Setup
function initUserSession() {
  const user = JSON.parse(localStorage.getItem('ohisee_user') || '{}');
  const roleEl = document.getElementById('ent-user-role');
  const nameEl = document.getElementById('ent-welcome-name');

  if (roleEl && user.role) roleEl.textContent = user.role.toUpperCase();
  if (nameEl && user.name) nameEl.textContent = `WELCOME BACK, ${user.name.toUpperCase()}`;
}

// 2. Fetch Summary Metrics
async function fetchSummaryMetrics() {
  try {
    const res = await fetch(`${API_BASE}/analytics/overview`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const { data } = await res.json();

    if (data) {
      if (document.getElementById('metric-prs')) document.getElementById('metric-prs').textContent = data.openPrs || 0;
      if (document.getElementById('metric-rfqs')) document.getElementById('metric-rfqs').textContent = data.openRfqs || 0;
      if (document.getElementById('metric-pos')) document.getElementById('metric-pos').textContent = data.totalPos || 0;
      if (document.getElementById('metric-invoices')) document.getElementById('metric-invoices').textContent = data.pendingInvoices || 0;
      if (document.getElementById('metric-disputes')) document.getElementById('metric-disputes').textContent = data.openDisputes || 0;
    }
  } catch (err) {
    console.warn('Metrics fetch notice:', err.message);
  }
}

// 3. Navigation Links & Smart Scroller Engine
function bindNavigation() {
  initSmartNavScroller();

  const navItems = document.querySelectorAll('.ent-nav-item');

  function activateTabByNavKey(navKey, scrollSection = true) {
    let matchedItem = null;
    navItems.forEach(l => {
      const itemKey = l.getAttribute('data-nav') || l.getAttribute('href')?.replace('#', '');
      if (itemKey === navKey) {
        l.classList.add('active');
        matchedItem = l;
      } else {
        l.classList.remove('active');
      }
    });

    if (matchedItem) {
      scrollActiveTabIntoCenter(matchedItem);
      if (scrollSection && navKey !== 'home') {
        const sec = document.getElementById(`sec-${navKey}`);
        if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      } else if (scrollSection && navKey === 'home') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  navItems.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetNav = link.getAttribute('data-nav') || link.getAttribute('href')?.replace('#', '');
      activateTabByNavKey(targetNav, true);
    });
  });

  function handleHashNav() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      activateTabByNavKey(hash, true);
    }
  }

  window.addEventListener('hashchange', handleHashNav);
  setTimeout(handleHashNav, 200);
}

function initSmartNavScroller() {
  const container = document.getElementById('ent-nav-links');
  const prevBtn = document.getElementById('ent-nav-prev');
  const nextBtn = document.getElementById('ent-nav-next');
  if (!container) return;

  function updateArrows() {
    const scrollLeft = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (prevBtn) prevBtn.classList.toggle('visible', scrollLeft > 8);
    if (nextBtn) nextBtn.classList.toggle('visible', scrollLeft < maxScroll - 8);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      container.scrollBy({ left: -220, behavior: 'smooth' });
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      container.scrollBy({ left: 220, behavior: 'smooth' });
    });
  }

  // Mouse wheel horizontal scroll translation
  container.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      container.scrollLeft += e.deltaY * 0.9;
      updateArrows();
    }
  }, { passive: false });

  // Click & drag to scroll desktop support
  let isDown = false;
  let startX, scrollLeftPos;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - container.offsetLeft;
    scrollLeftPos = container.scrollLeft;
  });

  container.addEventListener('mouseleave', () => { isDown = false; });
  container.addEventListener('mouseup', () => { isDown = false; });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5;
    container.scrollLeft = scrollLeftPos - walk;
    updateArrows();
  });

  container.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);
  setTimeout(updateArrows, 100);
}

function scrollActiveTabIntoCenter(activeItem) {
  const container = document.getElementById('ent-nav-links');
  if (!container || !activeItem) return;

  const containerRect = container.getBoundingClientRect();
  const itemRect = activeItem.getBoundingClientRect();
  const scrollOffset = (itemRect.left - containerRect.left) - (containerRect.width / 2) + (itemRect.width / 2);

  container.scrollBy({ left: scrollOffset, behavior: 'smooth' });
}

// 4. Global Search
function bindSearch() {
  const searchInput = document.getElementById('ent-global-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.ent-module-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(term) ? 'flex' : 'none';
    });
  });
}

// 5. Favorite Starring & Recently Used
function bindModuleCards() {
  document.querySelectorAll('.ent-module-card').forEach(card => {
    const moduleKey = card.getAttribute('data-module');
    const starBtn = card.querySelector('.ent-star-btn');

    if (starredModules.includes(moduleKey) && starBtn) {
      starBtn.classList.add('starred');
    }

    if (starBtn) {
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(moduleKey, starBtn);
      });
    }

    card.addEventListener('click', () => {
      openModuleDrawer(moduleKey, card.querySelector('.ent-card-name')?.textContent || moduleKey);
      addToRecent(moduleKey);
    });
  });

  document.getElementById('ent-drawer-close')?.addEventListener('click', closeModuleDrawer);
}

function toggleFavorite(key, btn) {
  if (starredModules.includes(key)) {
    starredModules = starredModules.filter(k => k !== key);
    btn.classList.remove('starred');
  } else {
    starredModules.push(key);
    btn.classList.add('starred');
  }
  localStorage.setItem('ohisee_starred_modules', JSON.stringify(starredModules));
  updateFavoritesUI();
}

function addToRecent(key) {
  recentModules = [key, ...recentModules.filter(k => k !== key)].slice(0, 4);
  localStorage.setItem('ohisee_recent_modules', JSON.stringify(recentModules));
  updateRecentUI();
}

function updateFavoritesUI() {
  const section = document.getElementById('ent-favorites-section');
  const grid = document.getElementById('ent-favorites-grid');
  if (!section || !grid) return;

  if (starredModules.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  grid.innerHTML = '';

  starredModules.forEach(key => {
    const orig = document.querySelector(`.ent-module-card[data-module="${key}"]`);
    if (orig) {
      const clone = orig.cloneNode(true);
      clone.onclick = () => openModuleDrawer(key, clone.querySelector('.ent-card-name')?.textContent);
      grid.appendChild(clone);
    }
  });
}

function updateRecentUI() {
  const section = document.getElementById('ent-recent-section');
  const grid = document.getElementById('ent-recent-grid');
  if (!section || !grid) return;

  if (recentModules.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  grid.innerHTML = '';

  recentModules.forEach(key => {
    const orig = document.querySelector(`.ent-module-card[data-module="${key}"]`);
    if (orig) {
      const clone = orig.cloneNode(true);
      clone.onclick = () => openModuleDrawer(key, clone.querySelector('.ent-card-name')?.textContent);
      grid.appendChild(clone);
    }
  });
}

// 6. Drawer Launcher Engine & Data Table Renderers
function openModuleDrawer(moduleKey, title) {
  const drawer = document.getElementById('ent-drawer');
  const titleEl = document.getElementById('ent-drawer-title');
  const bodyEl = document.getElementById('ent-drawer-body');

  titleEl.textContent = title || moduleKey.toUpperCase();
  bodyEl.innerHTML = `<div style="text-align:center;padding:40px;color:#FFD400;">⏳ Loading module data...</div>`;
  drawer.classList.add('open');

  // Route to specific module view loader
  switch (moduleKey) {
    case 'purchase-requisitions': loadPRModule(bodyEl); break;
    case 'rfqs': loadRFQModule(bodyEl); break;
    case 'quotation-comparison': loadQuotationComparisonModule(bodyEl); break;
    case 'purchase-orders': loadPOModule(bodyEl); break;
    case 'build-supply-orders': loadBuildSupplyOrdersModule(bodyEl); break;
    case 'turnkey-kits': loadTurnkeyKitsModule(bodyEl); break;
    case 'site-supply-schedule': loadSiteSupplyScheduleModule(bodyEl); break;
    case 'contractor-supply-matcher': loadContractorMatcherModule(bodyEl); break;
    case 'vendor-onboarding': loadVendorOnboardingModule(bodyEl); break;
    case 'vendor-list': loadVendorListModule(bodyEl); break;
    case 'smart-delivery': loadSmartDeliveryModule(bodyEl); break;
    case 'gate-entry': loadGateEntryModule(bodyEl); break;
    case 'grn': loadGRNModule(bodyEl); break;
    case 'ap-automation':
    case 'invoice-management': loadInvoiceModule(bodyEl); break;
    case 'dispute-management': loadDisputeModule(bodyEl); break;
    case 'reports-analytics': loadAnalyticsModule(bodyEl); break;
    default:
      loadGenericModule(bodyEl, title);
  }
}

function closeModuleDrawer() {
  document.getElementById('ent-drawer')?.classList.remove('open');
}

// --- Module Loaders ---

async function loadPRModule(container) {
  try {
    const res = await fetch(`${API_BASE}/procurement/purchase-requisitions`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Active Purchase Requisitions</h3>
        <button class="btn-hero-primary" onclick="alert('Creating new Purchase Requisition wizard initiated.')" style="font-size:12px;padding:8px 14px;">+ New Requisition</button>
      </div>
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>PR Number</th>
              <th>Title</th>
              <th>Category</th>
              <th>Required Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(pr => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${pr.pr_number}</td>
          <td>${pr.title}</td>
          <td>${pr.category}</td>
          <td>${pr.required_date || '-'}</td>
          <td><span class="ent-badge ent-badge-active">${pr.status}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load PRs: ${err.message}</div>`;
  }
}

async function loadRFQModule(container) {
  try {
    const res = await fetch(`${API_BASE}/procurement/rfqs`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Requests for Quotations</h3>
        <button class="btn-hero-primary" onclick="alert('Creating new RFQ wizard initiated.')" style="font-size:12px;padding:8px 14px;">+ Issue RFQ</button>
      </div>
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>RFQ Number</th>
              <th>Title</th>
              <th>Response Deadline</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(rfq => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${rfq.rfq_number}</td>
          <td>${rfq.title}</td>
          <td>${rfq.response_deadline ? new Date(rfq.response_deadline).toLocaleDateString('en-IN') : '-'}</td>
          <td><span class="ent-badge ent-badge-pending">${rfq.status}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load RFQs: ${err.message}</div>`;
  }
}

async function loadQuotationComparisonModule(container) {
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h3>Supplier Quotation Side-by-Side Comparison</h3>
      <p style="color:#888;font-size:13px;">Comparing received quotes for RFQ-84920 (Electrical & Plumbing Material Requisition)</p>
    </div>
    <div class="ent-table-wrapper">
      <table class="ent-table">
        <thead>
          <tr>
            <th>Criteria</th>
            <th>Schneider Electric India</th>
            <th>Finolex Cables & Pipes</th>
            <th>Supreme Industries</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Total Bid Amount</strong></td><td style="color:#FFD400;font-weight:700;">₹4,25,000</td><td>₹4,60,000</td><td>₹4,10,000</td></tr>
          <tr><td><strong>Delivery Days</strong></td><td>5 Days</td><td>3 Days</td><td style="color:#00A651;font-weight:700;">2 Days</td></tr>
          <tr><td><strong>Payment Terms</strong></td><td>Net 30 Days</td><td>Net 15 Days</td><td>Net 30 Days</td></tr>
          <tr><td><strong>Quality Score</strong></td><td>98/100</td><td>94/100</td><td>96/100</td></tr>
          <tr><td><strong>Action</strong></td>
            <td><button class="btn-hero-outline" style="font-size:11px;padding:4px 8px;">Select Quote</button></td>
            <td><button class="btn-hero-outline" style="font-size:11px;padding:4px 8px;">Select Quote</button></td>
            <td><button class="btn-hero-primary" style="font-size:11px;padding:4px 8px;">Accept & Issue PO</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

async function loadPOModule(container) {
  try {
    const res = await fetch(`${API_BASE}/procurement/purchase-orders`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Purchase Orders</h3>
      </div>
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Supplier Name</th>
              <th>Expected Delivery</th>
              <th>Total Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(po => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${po.po_number}</td>
          <td>${po.supplier_name}</td>
          <td>${po.expected_delivery_date || '-'}</td>
          <td style="font-weight:700;">₹${Number(po.total_amount || 0).toLocaleString('en-IN')}</td>
          <td><span class="ent-badge ent-badge-active">${po.status}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load POs: ${err.message}</div>`;
  }
}

async function loadVendorOnboardingModule(container) {
  try {
    const res = await fetch(`${API_BASE}/suppliers/onboarding-requests`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Pending Vendor Onboarding Applications</h3>
        <a href="vendor-onboarding.html" class="btn-hero-primary" style="font-size:12px;padding:8px 14px;text-decoration:none;" target="_blank">+ Vendor Onboarding Portal</a>
      </div>
    `;

    if (!data || !data.length) {
      html += `
        <div style="text-align:center;padding:40px;background:#111;border:1px solid #222;border-radius:12px;color:#888;">
          <div style="font-size:32px;margin-bottom:8px;">🤝</div>
          <div>No pending vendor applications awaiting review.</div>
          <div style="margin-top:12px;"><a href="vendor-onboarding.html" style="color:#FFD400;font-size:13px;" target="_blank">Open Vendor Onboarding Form →</a></div>
        </div>
      `;
    } else {
      html += `
        <div class="ent-table-wrapper">
          <table class="ent-table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>GSTIN / PAN</th>
                <th>Categories</th>
                <th>City</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.forEach(req => {
        const cats = Array.isArray(req.categories) ? req.categories.join(', ') : (req.categories || 'General');
        html += `
          <tr>
            <td style="font-weight:700;color:#fff;">${req.company_name}</td>
            <td style="font-family:'Space Grotesk',monospace;color:#FFD400;">${req.gstin}</td>
            <td>${cats}</td>
            <td>${req.city}, ${req.state}</td>
            <td><span class="ent-badge ent-badge-pending">${req.status}</span></td>
            <td>
              <button class="btn-hero-primary" style="font-size:10px;padding:4px 8px;margin-right:6px;" onclick="approveVendorApp('${req.id}')">Approve ✓</button>
              <button class="btn-hero-outline" style="font-size:10px;padding:4px 8px;color:#ff4d4d;border-color:#ff4d4d;" onclick="rejectVendorApp('${req.id}')">Reject ✕</button>
            </td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load onboarding requests: ${err.message}</div>`;
  }
}

window.approveVendorApp = async function(id) {
  try {
    const res = await fetch(`${API_BASE}/suppliers/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to approve');
    alert('Vendor Application Approved! Role updated to SUPPLIER.');
    loadVendorOnboardingModule(document.getElementById('ent-drawer-body'));
  } catch (err) {
    alert('Error approving vendor: ' + err.message);
  }
};

window.rejectVendorApp = async function(id) {
  const reason = prompt('Enter rejection reason:');
  if (!reason) return;
  try {
    const res = await fetch(`${API_BASE}/suppliers/${id}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error('Failed to reject');
    alert('Vendor Application Rejected.');
    loadVendorOnboardingModule(document.getElementById('ent-drawer-body'));
  } catch (err) {
    alert('Error rejecting vendor: ' + err.message);
  }
};

async function loadVendorListModule(container) {
  try {
    const res = await fetch(`${API_BASE}/suppliers`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Verified Active Suppliers Catalog (360 Performance)</h3>
        <a href="vendor-onboarding.html" class="btn-hero-primary" style="font-size:12px;padding:8px 14px;text-decoration:none;" target="_blank">+ Vendor Registration Portal</a>
      </div>
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>GSTIN</th>
              <th>Categories</th>
              <th>Rating Score</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(v => {
      const cats = Array.isArray(v.categories) ? v.categories.join(', ') : (v.categories || 'General');
      html += `
        <tr>
          <td style="font-weight:700;color:#fff;">${v.company_name}</td>
          <td style="font-family:'Space Grotesk',monospace;color:#FFD400;">${v.gstin}</td>
          <td>${cats}</td>
          <td style="color:#FFD400;font-weight:700;">${v.rating || 4.5} / 5.0 ⭐</td>
          <td><span class="ent-badge ent-badge-active">${v.status}</span></td>
          <td>
            <button class="btn-hero-primary" style="font-size:10px;padding:4px 8px;" onclick="alert('Sending RFQ invitation to ${v.company_name}')">Invite to RFQ</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load Vendor List: ${err.message}</div>`;
  }
}

async function loadSmartDeliveryModule(container) {
  try {
    const res = await fetch(`${API_BASE}/logistics/shipments`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>Shipment No</th>
              <th>Vehicle No</th>
              <th>Driver</th>
              <th>Tracking No</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(shp => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${shp.shipment_number}</td>
          <td>${shp.vehicle_number}</td>
          <td>${shp.driver_name} (${shp.driver_phone})</td>
          <td>${shp.tracking_number}</td>
          <td><span class="ent-badge ent-badge-active">${shp.status}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load shipments: ${err.message}</div>`;
  }
}

async function loadGateEntryModule(container) {
  try {
    const res = await fetch(`${API_BASE}/logistics/gate-entries`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Security Gate Entry Logs</h3>
        <button class="btn-hero-primary" onclick="alert('Gate Entry Record Form launched.')" style="font-size:12px;padding:8px 14px;">+ Record Vehicle Entry</button>
      </div>
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>Gate Entry No</th>
              <th>PO Number</th>
              <th>Vehicle Number</th>
              <th>Supplier</th>
              <th>Entry Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(ge => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${ge.gate_entry_number}</td>
          <td>${ge.po_number}</td>
          <td>${ge.vehicle_number}</td>
          <td>${ge.supplier_name}</td>
          <td>${ge.entry_time ? new Date(ge.entry_time).toLocaleTimeString('en-IN') : '-'}</td>
          <td><span class="ent-badge ent-badge-active">${ge.status}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load Gate Entries: ${err.message}</div>`;
  }
}

async function loadGRNModule(container) {
  try {
    const res = await fetch(`${API_BASE}/logistics/grns`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>GRN Number</th>
              <th>Received By</th>
              <th>Inspection Result</th>
              <th>Created Date</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(grn => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${grn.grn_number}</td>
          <td>${grn.received_by}</td>
          <td><span class="ent-badge ent-badge-active">${grn.inspection_status}</span></td>
          <td>${new Date(grn.created_at).toLocaleDateString('en-IN')}</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load GRNs: ${err.message}</div>`;
  }
}

async function loadInvoiceModule(container) {
  try {
    const res = await fetch(`${API_BASE}/finance/invoices`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>Invoice Number</th>
              <th>Total Amount</th>
              <th>3-Way Match</th>
              <th>Payment Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(inv => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${inv.invoice_number}</td>
          <td style="font-weight:700;">₹${Number(inv.total_amount || 0).toLocaleString('en-IN')}</td>
          <td><span class="ent-badge ent-badge-active">${inv.match_status}</span></td>
          <td><span class="ent-badge ${inv.payment_status === 'PAID' ? 'ent-badge-active' : 'ent-badge-pending'}">${inv.payment_status}</span></td>
          <td>
            ${inv.payment_status !== 'PAID' ? `<button class="btn-hero-primary" style="font-size:10px;padding:4px 8px;" onclick="alert('Payment initiated for ${inv.invoice_number}')">Process Payment</button>` : 'Paid ✓'}
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load Invoices: ${err.message}</div>`;
  }
}

async function loadDisputeModule(container) {
  try {
    const res = await fetch(`${API_BASE}/quality/disputes`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Quality & Delivery Disputes</h3>
        <button class="btn-hero-primary" onclick="alert('Raise Dispute form opened.')" style="font-size:12px;padding:8px 14px;">+ Raise Dispute</button>
      </div>
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>Dispute No</th>
              <th>Subject</th>
              <th>Target Entity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(dsp => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${dsp.dispute_number}</td>
          <td>${dsp.subject}</td>
          <td>${dsp.target_entity}</td>
          <td><span class="ent-badge ent-badge-exception">${dsp.status}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load Disputes: ${err.message}</div>`;
  }
}

async function loadAnalyticsModule(container) {
  container.innerHTML = `
    <div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <h3>Procurement Spend & Cost Variance Report</h3>
        <p style="color:#888;font-size:13px;">Real-time analytics aggregated across all active projects</p>
      </div>
      <a href="${API_BASE}/analytics/export/csv" class="btn-hero-primary" style="font-size:12px;padding:8px 14px;text-decoration:none;">📥 Export CSV Report</a>
    </div>
    <div class="ent-summary-grid">
      <div class="ent-summary-card">
        <div class="ent-summary-label">TOTAL PROCUREMENT SPEND</div>
        <div class="ent-summary-value">₹48,50,000</div>
      </div>
      <div class="ent-summary-card">
        <div class="ent-summary-label">RFQ NEGOTIATION SAVINGS</div>
        <div class="ent-summary-value" style="color:#00A651;">₹4,12,000</div>
      </div>
      <div class="ent-summary-card">
        <div class="ent-summary-label">AVG DELIVERY CYCLE</div>
        <div class="ent-summary-value">5.4 Days</div>
      </div>
      <div class="ent-summary-card">
        <div class="ent-summary-label">QUALITY PASS RATE</div>
        <div class="ent-summary-value">96.2%</div>
      </div>
    </div>
  `;
}

function loadGenericModule(container, title) {
  container.innerHTML = `
    <div style="padding:20px;text-align:center;">
      <h3>${title} Module</h3>
      <p style="color:#888;">Module control panel loaded successfully.</p>
    </div>
  `;
}

// --- Build & Supply Module Loaders ---

async function loadBuildSupplyOrdersModule(container) {
  try {
    const res = await fetch(`${API_BASE}/build-supply/orders`, { headers: getAuthHeaders() });
    const { data } = await res.json();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3>Active Build & Supply Orders</h3>
        <button class="btn-hero-primary" onclick="window.openStartProjectModal ? window.openStartProjectModal() : alert('Initiating Build & Supply Requisition Wizard...')" style="font-size:12px;padding:8px 14px;">+ New Build & Supply Order</button>
      </div>
      <div class="ent-table-wrapper">
        <table class="ent-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Project Name</th>
              <th>Package Name</th>
              <th>Supplier / Trade Match</th>
              <th>Total Amount</th>
              <th>Delivery Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    (data || []).forEach(bso => {
      html += `
        <tr>
          <td style="font-family:'Space Grotesk',monospace;font-weight:700;color:#FFD400;">${bso.po_number || bso.id}</td>
          <td style="font-weight:700;color:#fff;">${bso.project_name}</td>
          <td>${bso.package_name}</td>
          <td>${bso.supplier_name}</td>
          <td style="font-weight:700;color:#FFD400;">₹${Number(bso.total_amount || 0).toLocaleString('en-IN')}</td>
          <td><span class="ent-badge ent-badge-active">${bso.delivery_status}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load Build & Supply Orders: ${err.message}</div>`;
  }
}

async function loadTurnkeyKitsModule(container) {
  try {
    const res = await fetch(`${API_BASE}/build-supply/packages`);
    const { data } = await res.json();

    let html = `
      <div style="margin-bottom:20px;">
        <h3>Pre-calculated Turnkey Material Kits</h3>
        <p style="color:#888;font-size:13px;">Standardized material bundles engineered for maximum cost efficiency and site speed.</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;">
    `;

    (data || []).forEach(kit => {
      html += `
        <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:11px;background:#FFD40022;color:#FFD400;padding:2px 8px;border-radius:4px;font-weight:700;">${kit.category}</span>
            <span style="font-size:12px;color:#888;">${kit.targetArea}</span>
          </div>
          <h4 style="color:#fff;margin:0 0 8px 0;">${kit.title}</h4>
          <div style="font-size:18px;font-weight:700;color:#FFD400;margin-bottom:12px;">${kit.estimatedBudget}</div>
          <div style="font-size:12px;color:#aaa;margin-bottom:12px;">Included Materials:</div>
          <ul style="font-size:12px;color:#ddd;padding-left:18px;margin:0 0 16px 0;">
            ${kit.includedMaterials.map(m => `<li>${m}</li>`).join('')}
          </ul>
          <button class="btn-hero-primary" style="width:100%;font-size:12px;padding:8px;" onclick="orderTurnkeyKit('${kit.title}', '${kit.estimatedBudget}')">Dispatch Kit to Site →</button>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ff4d4d;padding:20px;">Failed to load Turnkey Kits: ${err.message}</div>`;
  }
}

async function loadSiteSupplyScheduleModule(container) {
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h3>Active Construction Site Dispatch Schedule</h3>
      <p style="color:#888;font-size:13px;">Real-time material delivery schedule across project milestones</p>
    </div>
    <div class="ent-table-wrapper">
      <table class="ent-table">
        <thead>
          <tr>
            <th>Dispatch Date</th>
            <th>Site / Location</th>
            <th>Material Bundle</th>
            <th>Logistics Partner</th>
            <th>Site Supervisor Contact</th>
            <th>Dispatch Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Today, 08:30 AM</td>
            <td style="color:#fff;font-weight:700;">Coimbatore Villa Site - Plot 42</td>
            <td>TMT Steel 12 Tons + OPC Cement 200 Bags</td>
            <td>VRL Logistics Express</td>
            <td>Ramesh K. (+91 98765 43210)</td>
            <td><span class="ent-badge ent-badge-active">IN TRANSIT</span></td>
          </tr>
          <tr>
            <td>Tomorrow, 10:00 AM</td>
            <td style="color:#fff;font-weight:700;">Kochi Commercial Complex Phase 2</td>
            <td>CPVC Plumbing Pipes & Heavy Valves</td>
            <td>Gati Site Express</td>
            <td>Siddharth M. (+91 98765 11223)</td>
            <td><span class="ent-badge ent-badge-pending">SCHEDULED</span></td>
          </tr>
          <tr>
            <td>09 Sep 2026</td>
            <td style="color:#fff;font-weight:700;">Chennai Residential Tower B</td>
            <td>Modular Electrical Switch Boards & Wires</td>
            <td>Internal Dispatch Fleet</td>
            <td>Vijay R. (+91 94433 22110)</td>
            <td><span class="ent-badge ent-badge-pending">PACKING</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

async function loadContractorMatcherModule(container) {
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h3>Contractor & Material Supply Matcher</h3>
      <p style="color:#888;font-size:13px;">AI pairing of verified material supply packages with licensed execution subcontractors</p>
    </div>
    <div class="ent-table-wrapper">
      <table class="ent-table">
        <thead>
          <tr>
            <th>Subcontractor Team</th>
            <th>Specialization</th>
            <th>Verified Supply Partner</th>
            <th>Match Score</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="color:#fff;font-weight:700;">Apex Civil Execution Team</td>
            <td>RCC & Structure Works</td>
            <td>UltraTech & JSW Steel Direct</td>
            <td style="color:#00A651;font-weight:700;">99.4% Match ⭐</td>
            <td><button class="btn-hero-primary" style="font-size:10px;padding:4px 8px;" onclick="alert('Turnkey Build & Supply agreement issued!')">Assign Turnkey PO</button></td>
          </tr>
          <tr>
            <td style="color:#fff;font-weight:700;">Sparkline Electricals</td>
            <td>Commercial Wiring & High Load DBs</td>
            <td>Finolex & Schneider Hub</td>
            <td style="color:#00A651;font-weight:700;">97.8% Match ⭐</td>
            <td><button class="btn-hero-primary" style="font-size:10px;padding:4px 8px;" onclick="alert('Turnkey Build & Supply agreement issued!')">Assign Turnkey PO</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

window.orderTurnkeyKit = async function(kitTitle, budget) {
  const phone = prompt(`Order "${kitTitle}" (${budget})\nEnter contact phone number:`, '9876543210');
  if (!phone) return;
  try {
    const res = await fetch(`${API_BASE}/build-supply/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        projectName: 'Enterprise Site Order',
        packageName: kitTitle,
        estimatedBudget: budget,
        contactPhone: phone
      })
    });
    const data = await res.json();
    alert(data.message || 'Build & Supply order placed successfully!');
    loadBuildSupplyOrdersModule(document.getElementById('ent-drawer-body'));
  } catch (err) {
    alert('Failed to place order: ' + err.message);
  }
};

