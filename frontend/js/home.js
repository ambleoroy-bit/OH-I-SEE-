// ============================================================
// OH I SEE — Home Page Controller
// AI Construction Operating Platform
// ============================================================

function homeApiBase() {
  return typeof resolveOhiseeApiBase === 'function'
    ? resolveOhiseeApiBase()
    : ((location.port === '3000' || location.port === '5173') ? '/api' : 'http://127.0.0.1:3001/api');
}

const QUALITY_LABELS = {
  Economic: 'Economic — Budget-conscious',
  Standard: 'Standard — Balanced quality',
  Premium: 'Premium — Higher-end finishes'
};

function intentTypeFromProjectType(type) {
  if (type === 'Renovation' || type === 'Interior') return 'RENOVATION';
  return 'NEW_HOME';
}

function buildIntentAnswersFromModal(name, type, city, budget, quality) {
  const answers = {};
  if (city) answers.location = city;
  if (name) answers.project_name = name;
  const budgetNum = parseFloat(budget);
  if (budgetNum > 0) {
    answers.budget_mode = 'manual';
    answers.budget = budgetNum;
  } else if (quality && quality !== 'Custom' && QUALITY_LABELS[quality]) {
    answers.budget_mode = 'quality';
    answers.quality = QUALITY_LABELS[quality];
  }
  if (type === 'Renovation') {
    answers.property_type = 'Independent House';
  }
  return answers;
}

function goToIntentEngineAfterBuild(draft) {
  sessionStorage.setItem('ohisee_build_project_draft', JSON.stringify(draft));
  const intent = draft.intentType || 'NEW_HOME';
  window.location.href = `intent-engine.html?intent=${intent}`;
}

function closeStartProjectModal() {
  const name = document.getElementById('sp-name')?.value.trim() || '';
  const type = document.getElementById('sp-type')?.value || 'Residential';
  const city = document.getElementById('sp-city')?.value.trim() || '';
  const budget = document.getElementById('sp-budget')?.value;
  const quality = document.getElementById('sp-quality')?.value;
  document.getElementById('start-project-modal')?.remove();
  goToIntentEngineAfterBuild({
    intentType: intentTypeFromProjectType(type),
    answers: buildIntentAnswersFromModal(name, type, city, budget, quality)
  });
}

// ── Auth check ────────────────────────────────────────────
function getToken() {
  return typeof TokenStore !== 'undefined' ? TokenStore.get() : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token') || sessionStorage.getItem('ohisee_token') || null);
}
function isLoggedIn() { return !!getToken(); }

// ── My Projects Dashboard ────────────────────────────────
async function initProjectsDashboard() {
  const section = document.getElementById('my-projects-section');
  const grid = document.getElementById('projects-grid');
  if (!section || !grid) return;

  if (!isLoggedIn()) {
    grid.innerHTML = `
      <div class="projects-state">
        <div class="projects-state-icon">🏗️</div>
        <div class="projects-state-title">No Active Projects</div>
        <div class="projects-state-desc">Sign in to view your construction projects, or start a new one right now.</div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a href="login.html" class="btn-hero-primary" style="text-decoration:none;">Sign In</a>
          <a href="login.html?redirect=start-project" class="btn-hero-outline" style="text-decoration:none;">Create Account</a>
        </div>
      </div>`;
    return;
  }

  // Show loading skeletons
  grid.innerHTML = Array(3).fill(`
    <div class="project-skeleton">
      <div class="skeleton-line wide"></div>
      <div class="skeleton-line medium" style="margin-top:8px;"></div>
      <div class="skeleton-line short" style="margin-top:16px;"></div>
      <div class="skeleton-line" style="width:100%;margin-top:12px;height:6px;"></div>
    </div>`).join('');

  try {
    const resp = await fetch(`${homeApiBase()}/projects`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    if (resp.status === 401) {
      // Token expired
      grid.innerHTML = `
        <div class="projects-state">
          <div class="projects-state-icon">🔒</div>
          <div class="projects-state-title">Session Expired</div>
          <div class="projects-state-desc">Please sign in again to view your projects.</div>
          <a href="login.html" class="btn-hero-primary" style="text-decoration:none;display:inline-block;margin-top:16px;">Sign In</a>
        </div>`;
      return;
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    let projects = payload.data || payload.projects || [];

    try {
      const local = JSON.parse(localStorage.getItem('ohisee_local_projects') || '[]');
      if (Array.isArray(local)) {
        const byId = new Map(projects.map((p) => [p.project_id, p]));
        for (const p of local) {
          if (p?.project_id && !byId.has(p.project_id)) byId.set(p.project_id, p);
        }
        projects = [...byId.values()];
      }
    } catch (e) {}

    if (!projects || projects.length === 0) {
      grid.innerHTML = `
        <div class="projects-state">
          <div class="projects-state-icon">📐</div>
          <div class="projects-state-title">No Projects Yet</div>
          <div class="projects-state-desc">Start your first AI-guided construction project. It takes less than 2 minutes.</div>
          <button onclick="openStartProjectModal()" class="btn-hero-primary" style="margin-top:16px;">Start My Project</button>
        </div>`;
      return;
    }

    grid.innerHTML = projects.map(p => renderProjectCard(p)).join('');

  } catch (err) {
    console.error('Projects load error:', err);
    grid.innerHTML = `
      <div class="projects-state">
        <div class="projects-state-icon">⚠️</div>
        <div class="projects-state-title">Could Not Load Projects</div>
        <div class="projects-state-desc">Unable to load your projects. Please check your connection.</div>
        <button onclick="initProjectsDashboard()" class="btn-hero-outline" style="margin-top:16px;">Try Again</button>
      </div>`;
  }
}

function renderProjectCard(p) {
  const stages = [
    { label: 'Design', value: p.progress_design || 0 },
    { label: 'BOQ', value: p.progress_boq || 0 },
    { label: 'Estimate', value: p.progress_estimate || 0 },
    { label: 'Products', value: p.progress_products || 0 },
    { label: 'Procurement', value: p.progress_procurement || 0 },
    { label: 'Construction', value: p.progress_construction || 0 }
  ];
  const overall = Math.round(stages.reduce((s, x) => s + x.value, 0) / stages.length);

  const statusClass = { active: 'status-active', paused: 'status-paused', completed: 'status-completed' }[p.status] || 'status-active';
  const statusLabel = { active: 'Active', paused: 'Paused', completed: 'Completed' }[p.status] || 'Active';

  const updatedAt = new Date(p.updated_at);
  const updatedLabel = updatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const cost = p.estimated_cost > 0
    ? `₹${(p.estimated_cost / 100000).toFixed(1)}L` : 'Est. pending';

  return `
    <div class="project-card">
      <div class="project-card-header">
        <span class="project-id">${p.project_id}</span>
        <span class="project-status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="project-card-body">
        <div class="project-name">${escHtml(p.project_name)}</div>
        <div class="project-meta">
          <span>🏠 ${escHtml(p.project_type)}</span>
          ${p.city ? `<span>📍 ${escHtml(p.city)}</span>` : ''}
          <span>📅 ${updatedLabel}</span>
        </div>

        <div class="project-stages">
          ${stages.map(s => `
            <div class="stage-row">
              <span class="stage-label">${s.label}</span>
              <div class="stage-bar">
                <div class="stage-bar-fill" style="width:${s.value}%"></div>
              </div>
              <span class="stage-pct">${s.value}%</span>
            </div>`).join('')}
        </div>

        <div class="project-overall">
          <span class="project-overall-label">Overall Progress</span>
          <span class="project-overall-pct">${overall}%</span>
        </div>

        <div class="project-cost">Estimated Cost: <strong>${cost}</strong></div>

        <div class="project-card-actions">
          <a href="project-detail.html?id=${p.project_id}" class="btn-project-continue">
            Continue ▸
          </a>
          <a href="project-detail.html?id=${p.project_id}" class="btn-project-view">
            View
          </a>
        </div>
      </div>
    </div>`;
}

// ── Product Recommendations ───────────────────────────────
async function initProductRecommendations() {
  const grid = document.getElementById('rec-products-grid');
  if (!grid) return;

  grid.innerHTML = Array(4).fill(`
    <div class="project-skeleton">
      <div class="skeleton-line" style="width:100%;height:160px;margin-bottom:12px;"></div>
      <div class="skeleton-line wide"></div>
      <div class="skeleton-line medium"></div>
    </div>`).join('');

  try {
    const resp = await fetch(`${homeApiBase()}/products?limit=8&sort=featured`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const result = await resp.json();
    const products = result.data || result.products || result || [];

    if (!products.length) {
      grid.innerHTML = `<div class="projects-state" style="grid-column:1/-1;">
        <div class="projects-state-icon">📦</div>
        <div class="projects-state-title">Products Loading</div>
        <div class="projects-state-desc">Our catalog is being updated.</div>
        <a href="products.html" class="btn-hero-outline" style="margin-top:16px;display:inline-block;">Browse All Products</a>
      </div>`;
      return;
    }

    grid.innerHTML = products.slice(0, 8).map(p => renderProductCardDark(p)).join('');

  } catch (err) {
    console.error('Products load error:', err);
    grid.innerHTML = `<div class="projects-state" style="grid-column:1/-1;">
      <div class="projects-state-icon">⚠️</div>
      <div class="projects-state-title">Products Could Not Load</div>
      <button onclick="initProductRecommendations()" class="btn-hero-outline" style="margin-top:12px;">Retry</button>
    </div>`;
  }
}

function renderProductCardDark(p) {
  const name = p.product_name || p.name || 'Product';
  const brand = p.brand || '';
  const price = p.price || 0;
  const orig = p.original_price || 0;
  const img = p.image_url || p.image || '/images/logo.png';
  const id = p.id;

  return `
    <div class="product-card-dark">
      <div class="product-card-dark-img">
        <div class="ai-rec-badge">⚡ AI Recommended</div>
        <img src="${escHtml(img)}" alt="${escHtml(name)}" loading="lazy"
             onerror="this.src='/images/logo.png'">
      </div>
      <div class="product-card-dark-body">
        ${brand ? `<div class="product-card-dark-brand">${escHtml(brand)}</div>` : ''}
        <div class="product-card-dark-name">${escHtml(name)}</div>
        <div class="product-card-dark-price">
          ₹${Number(price).toLocaleString('en-IN')}
          ${orig && orig > price ? `<span class="original">₹${Number(orig).toLocaleString('en-IN')}</span>` : ''}
        </div>
        <div class="product-card-dark-footer">
          <button class="btn-add-cart-dark" onclick="homeAddToCart(${id}, this)">Add to Cart</button>
          <a href="product-detail.html?id=${id}" class="btn-view-dark">View</a>
        </div>
      </div>
    </div>`;
}

function homeAddToCart(productId, btn) {
  if (!isLoggedIn()) {
    if (typeof showToast === 'function') showToast('Please sign in to add items to cart', 'warning');
    else alert('Please sign in to add items to cart');
    return;
  }
  if (typeof Cart !== 'undefined' && Cart.addItem) {
    Cart.addItem(productId);
    btn.textContent = 'Added ✓';
    btn.style.background = '#00A651';
    setTimeout(() => { btn.textContent = 'Add to Cart'; btn.style.background = ''; }, 2000);
  } else {
    window.location.href = `product-detail.html?id=${productId}`;
  }
}


// ── AI Construction Assistant (Inline) ────────────────────
function initInlineAIAssistant() {
  const input = document.getElementById('home-ai-input');
  const sendBtn = document.getElementById('home-ai-send');
  const responseBox = document.getElementById('home-ai-response');
  if (!input || !sendBtn || !responseBox) return;

  // Prompt chips
  document.querySelectorAll('.ai-prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.textContent.trim();
      input.focus();
    });
  });

  async function sendMessage() {
    const msg = input.value.trim();
    if (!msg) return;

    sendBtn.disabled = true;
    responseBox.innerHTML = `<div class="ai-response-loading">
      <div class="ai-dot-anim"></div>
      <div class="ai-dot-anim"></div>
      <div class="ai-dot-anim"></div>
    </div>`;
    responseBox.classList.add('visible');

    try {
      const resp = await fetch(`${homeApiBase()}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: [] })
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      let html = `<div style="color:#FFD400;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;font-family:'Space Grotesk',monospace;">✨ AI ASSISTANT</div>`;

      // Text response (with basic markdown)
      if (data.text) {
        const formatted = (data.text)
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
          .replace(/\n/g,'<br>');
        html += `<div style="margin-bottom:12px;line-height:1.6;color:rgba(255,255,255,0.8);">${formatted}</div>`;
      }

      // Suggestion chips (from IntentEngine)
      if (data.chips && data.chips.length) {
        html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">`;
        data.chips.forEach(chip => {
          html += `<button class="ai-prompt-chip" onclick="document.getElementById('home-ai-input').value=this.textContent.trim();document.getElementById('home-ai-send').click();" style="font-size:11px;">${chip.replace(/</g,'&lt;')}</button>`;
        });
        html += `</div>`;
      }

      // Product cards
      if (data.type === 'products' && data.data && data.data.length) {
        html += `<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">`;
        data.data.slice(0, 4).forEach(p => {
          const img = (p.image || '/images/logo.png').replace(/"/g,'');
          html += `
            <div style="display:flex;align-items:center;gap:12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:10px 12px;">
              <img src="${img}" onerror="this.src='/images/logo.png'" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#222;flex-shrink:0;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(p.name||'').replace(/</g,'&lt;')}</div>
                <div style="font-size:11px;color:#555;">${(p.brand||'').replace(/</g,'&lt;')}</div>
                <div style="font-size:13px;font-weight:700;color:#FFD400;margin-top:2px;">&#8377;${Number(p.price||0).toLocaleString('en-IN')}</div>
              </div>
              <a href="product-detail.html?id=${p.id}" style="font-size:11px;font-weight:700;color:#FFD400;text-decoration:none;white-space:nowrap;font-family:'Space Grotesk',monospace;flex-shrink:0;">VIEW →</a>
            </div>`;
        });
        html += `</div>`;
        if (data.data.length > 4) {
          html += `<div style="text-align:center;margin-top:10px;"><a href="products.html" style="font-size:12px;color:#FFD400;font-family:'Space Grotesk',monospace;font-weight:700;text-decoration:none;">View All Products →</a></div>`;
        }
      }

      // Project list
      if (data.type === 'project' && data.data && data.data.items) {
        const proj = data.data;
        html += `<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;margin-top:4px;">
          <div style="background:#111;padding:10px 14px;font-family:'Space Grotesk',monospace;font-size:12px;font-weight:700;color:#FFD400;letter-spacing:1px;text-transform:uppercase;">${(proj.projectType||'').replace(/</g,'&lt;')} — Project List</div>
          <div style="padding:10px 14px;display:flex;flex-direction:column;gap:6px;">`;
        proj.items.slice(0, 6).forEach(item => {
          html += `<div style="display:flex;justify-content:space-between;font-size:12px;border-bottom:1px solid #222;padding-bottom:5px;">
            <span style="color:#ccc;">${(item.name||'').replace(/</g,'&lt;')} × ${item.quantity||1}</span>
            <span style="color:#FFD400;font-weight:600;">&#8377;${Number((item.price||0)*(item.quantity||1)).toLocaleString('en-IN')}</span>
          </div>`;
        });
        html += `</div>
          <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #2a2a2a;">
            <span style="font-size:13px;font-weight:700;color:#fff;font-family:'Space Grotesk',monospace;">Estimated Total</span>
            <span style="font-size:14px;font-weight:700;color:#FFD400;font-family:'Space Grotesk',monospace;">&#8377;${Number(proj.estimatedTotal||0).toLocaleString('en-IN')}</span>
          </div>
        </div>`;
      }

      // Open full chat nudge
      html += `<div style="margin-top:12px;text-align:right;">
        <button onclick="if(window.OHISEE_AI){window.OHISEE_AI.toggleWindow();}" style="font-size:11px;color:#FFD400;background:none;border:none;cursor:pointer;font-family:'Space Grotesk',monospace;font-weight:700;letter-spacing:0.5px;opacity:0.7;">Open Full Chat ✨</button>
      </div>`;

      responseBox.innerHTML = html;

    } catch (err) {
      responseBox.innerHTML = `<div style="color:#E53935;">
        Unable to reach the AI assistant. Please try again or use the chat button (✨) at bottom right.
      </div>`;
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

// ── Start Project Modal (Quick Create) ───────────────────
function openStartProjectModal() {
  // If a modal already exists, open it
  const existing = document.getElementById('start-project-modal');
  if (existing) { existing.classList.add('open'); return; }

  const modal = document.createElement('div');
  modal.id = 'start-project-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9000;
    display:flex;align-items:center;justify-content:center;padding:16px;`;

  modal.innerHTML = `
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:36px;max-width:500px;width:100%;position:relative;">
      <button onclick="closeStartProjectModal()"
        style="position:absolute;top:16px;right:16px;background:none;color:#777;font-size:20px;cursor:pointer;" title="Continue to full project form">✕</button>
      <div style="font-family:'Space Grotesk',monospace;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#FFD400;margin-bottom:16px;">New Project</div>
      <h2 style="font-family:'Space Grotesk',monospace;font-size:24px;font-weight:700;color:#fff;text-transform:uppercase;margin-bottom:24px;">Tell Us What You Want To Build</h2>

      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;font-family:'Space Grotesk',monospace;display:block;margin-bottom:6px;">Project Name *</label>
          <input id="sp-name" type="text" placeholder="e.g. Boomanur Residence" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;padding:12px 14px;">
        </div>
        <div>
          <label style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;font-family:'Space Grotesk',monospace;display:block;margin-bottom:6px;">Project Type</label>
          <select id="sp-type" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;padding:12px 14px;">
            <option value="Residential">Residential</option>
            <option value="Commercial">Commercial</option>
            <option value="Industrial">Industrial</option>
            <option value="Renovation">Renovation</option>
            <option value="Interior">Interior</option>
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;font-family:'Space Grotesk',monospace;display:block;margin-bottom:6px;">City</label>
            <input id="sp-city" type="text" placeholder="Coimbatore" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;padding:12px 14px;">
          </div>
          <div>
            <label style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;font-family:'Space Grotesk',monospace;display:block;margin-bottom:6px;">Budget (₹)</label>
            <input id="sp-budget" type="number" placeholder="3500000" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;padding:12px 14px;">
          </div>
        </div>
        <div>
          <label style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;font-family:'Space Grotesk',monospace;display:block;margin-bottom:6px;">Quality Level</label>
          <select id="sp-quality" style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;padding:12px 14px;">
            <option value="Economic">Economic — Budget-conscious</option>
            <option value="Standard" selected>Standard — Balanced</option>
            <option value="Premium">Premium — Higher-end</option>
            <option value="Custom">Custom Hybrid</option>
          </select>
        </div>
      </div>

      <div id="sp-error" style="color:#E53935;font-size:13px;margin-top:12px;display:none;"></div>

      <button id="sp-submit" onclick="submitNewProject()" style="width:100%;margin-top:20px;background:#FFD400;color:#000;font-family:'Space Grotesk',monospace;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;padding:14px;border-radius:8px;border:none;cursor:pointer;transition:all 0.2s ease;">
        Create Project ▸
      </button>
      <button type="button" onclick="closeStartProjectModal()" style="width:100%;margin-top:10px;background:transparent;color:#888;font-family:'Space Grotesk',monospace;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;padding:10px;border-radius:8px;border:1px solid #333;cursor:pointer;">
        Skip to Full Questionnaire →
      </button>
    </div>`;

  document.body.appendChild(modal);
  modal.classList.add('open');
  document.getElementById('sp-name').focus();
}

async function submitNewProject() {
  const name = document.getElementById('sp-name')?.value.trim();
  const type = document.getElementById('sp-type')?.value;
  const city = document.getElementById('sp-city')?.value.trim();
  const budget = document.getElementById('sp-budget')?.value;
  const quality = document.getElementById('sp-quality')?.value;
  const errEl = document.getElementById('sp-error');
  const btn = document.getElementById('sp-submit');

  if (!name) { errEl.textContent = 'Project name is required.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  if (!isLoggedIn()) {
    document.getElementById('start-project-modal')?.remove();
    goToIntentEngineAfterBuild({
      project_name: name,
      intentType: intentTypeFromProjectType(type),
      answers: buildIntentAnswersFromModal(name, type, city, budget, quality)
    });
    return;
  }

  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    const resp = await fetch(`${homeApiBase()}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ project_name: name, project_type: type, city, budget: parseFloat(budget) || 0, quality_level: quality })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to create project');

    const project = data.data;
    if (project) {
      try {
        localStorage.setItem('ohisee_recent_project', JSON.stringify(project));
        const cached = JSON.parse(localStorage.getItem('ohisee_local_projects') || '[]');
        const list = Array.isArray(cached) ? cached.filter((p) => p.project_id !== project.project_id) : [];
        list.unshift(project);
        localStorage.setItem('ohisee_local_projects', JSON.stringify(list.slice(0, 50)));
      } catch (e) {}
    }

    const projectId = project?.project_id;
    document.getElementById('start-project-modal')?.remove();
    goToIntentEngineAfterBuild({
      projectId,
      project_name: name,
      intentType: intentTypeFromProjectType(type),
      answers: buildIntentAnswersFromModal(name, type, city, budget, quality)
    });

  } catch (err) {
    errEl.textContent = err.message || 'Failed to create project. Please try again.';
    errEl.style.display = 'block';
    btn.textContent = 'Create Project ▸';
    btn.disabled = false;
  }
}

// ── Quality Card Selection ─────────────────────────────────
function initQualitySelector() {
  document.querySelectorAll('.quality-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.quality-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

// ── Location Chips ─────────────────────────────────────────
function initLocationChips() {
  document.querySelectorAll('.location-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.location-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

// ── Utility ───────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Intent Command Box ────────────────────────────────────
function initIntentCommandBox() {
  const input   = document.getElementById('ai-intent-input');
  const sendBtn = document.getElementById('ai-intent-send');
  const respEl  = document.getElementById('ai-intent-response');
  if (!input || !sendBtn) return;

  const INTENTS = [
    { patterns: ['build','new home','new house','construct','ground up','plot','gf','g+1','square feet','sq ft','sqft'], type: 'NEW_HOME',    label: 'New Home Builder' },
    { patterns: ['renovate','renovation','repaint','paint','alter','room alteration','upgrade','repair','restore'], type: 'RENOVATION',  label: 'Home Renovation' },
    { patterns: ['electrical','wiring','lights','lighting','switch','socket','mcb','fan','led','ac point','earthing'], type: 'ELECTRICAL', label: 'Electrical & Lighting' },
    { patterns: ['product','material','cement','steel','tile','pipe','switch','buy','shop','price','procure'],          type: 'PRODUCTS',   label: 'Product Finder' },
    { patterns: ['quotation','quote','compare','builder quote','tender','bid','best value'],                            type: 'QUOTES',     label: 'Quote Comparator' },
    { patterns: ['blueprint','floor plan','drawing','layout','2d plan','plan'],                                         type: 'BLUEPRINT',  label: 'Blueprint Builder' },
    { patterns: ['3d','visualise','visualize','render','see the house','model'],                                        type: 'VIZ3D',      label: '3D Visualizer' },
  ];

  const ROUTES = {
    NEW_HOME: 'intent-engine.html?intent=NEW_HOME',
    RENOVATION: 'intent-engine.html?intent=RENOVATION',
    ELECTRICAL: 'intent-engine.html?intent=ELECTRICAL',
    PRODUCTS: 'products.html',
    QUOTES: 'quote-compare.html',
    BLUEPRINT: 'blueprint-builder.html',
    VIZ3D: 'visualizer-3d.html',
  };

  function detectIntent(text) {
    const lower = text.toLowerCase();
    let best = null; let bestScore = 0;
    for (const intent of INTENTS) {
      const score = intent.patterns.filter(p => lower.includes(p)).length;
      if (score > bestScore) { bestScore = score; best = intent; }
    }
    return bestScore > 0 ? best : null;
  }

  function handleIntentInput() {
    const text = input.value.trim();
    if (!text) return;

    // Try to detect intent
    const intent = detectIntent(text);
    respEl.style.display = 'block';

    if (intent) {
      const url = ROUTES[intent.type];
      respEl.innerHTML = `
        <div style="font-family:'Space Grotesk',monospace;font-size:11px;font-weight:700;color:#FFD400;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">
          ▸ Detected Intent
        </div>
        <div style="font-size:14px;color:#fff;margin-bottom:12px;">
          I think you need the <strong>${intent.label}</strong> engine. Click below to continue:
        </div>
        <a href="${url}" class="intent-response-redirect">
          🚀 Open ${intent.label} →
        </a>`;
    } else {
      // Generic fallback
      respEl.innerHTML = `
        <div style="font-family:'Space Grotesk',monospace;font-size:11px;font-weight:700;color:#FFD400;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">
          ▸ Choose An Engine
        </div>
        <div style="font-size:13px;color:#888;margin-bottom:12px;">
          I couldn't detect a specific intent. Which do you need?
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:7px;">
          ${Object.entries(ROUTES).map(([k, url]) => `
            <a href="${url}" class="intent-quick-btn" style="font-size:10px;">${{ NEW_HOME:'🏠 Build New Home', RENOVATION:'🔨 Renovate', ELECTRICAL:'⚡ Electrical', PRODUCTS:'📦 Products', QUOTES:'⚖️ Compare Quotes', BLUEPRINT:'📐 Blueprint', VIZ3D:'🧊 3D Visualize' }[k]}</a>`).join('')}
        </div>`;
    }
  }

  sendBtn.addEventListener('click', handleIntentInput);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') handleIntentInput(); });
}

// ── Hero construction video (Supabase public URL) ─────────
function initHeroConstructionVideo() {
  const video = document.getElementById('hero-construction-video');
  if (!video) return;

  const runtime = window.OHISEE_RUNTIME || {};
  const videoUrl = runtime.CONSTRUCTION_HERO_VIDEO_URL
    || 'https://vsqdqgmndgjfhosozxfn.supabase.co/storage/v1/object/public/construction-videos/Contruction%20Video.mp4';

  const ensurePlayback = () => {
    if (!video.getAttribute('src')) {
      video.setAttribute('src', videoUrl);
      video.load();
    }
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.then(() => {
        video.removeAttribute('poster');
      }).catch(() => {});
    }
  };

  if (!video.getAttribute('src')) {
    video.setAttribute('src', videoUrl);
  }

  if (video.readyState >= 2) {
    ensurePlayback();
  } else {
    video.addEventListener('loadeddata', ensurePlayback, { once: true });
    video.addEventListener('canplay', ensurePlayback, { once: true });
  }

  // Defer heavy download until hero is near viewport (hero is usually immediate).
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          ensurePlayback();
          observer.disconnect();
        }
      });
    }, { rootMargin: '200px' });
    observer.observe(video);
  } else {
    ensurePlayback();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && video.paused) ensurePlayback();
  }, { passive: true });

  window.addEventListener('load', () => {
    ensurePlayback();
    setTimeout(ensurePlayback, 900);
  }, { once: true });
}

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHeroConstructionVideo();
  initProjectsDashboard();
  initProductRecommendations();
  initInlineAIAssistant();
  initQualitySelector();
  initLocationChips();
  initIntentCommandBox();

  if (new URLSearchParams(location.search).get('buildProject') === '1') {
    history.replaceState({}, '', 'index.html');
    if (isLoggedIn()) openStartProjectModal();
  }
});

// Expose for inline onclick use (assign immediately so clicks work even if DOMContentLoaded pending)
window.openStartProjectModal = openStartProjectModal;
window.closeStartProjectModal = closeStartProjectModal;
window.submitNewProject = submitNewProject;
window.homeAddToCart = homeAddToCart;
window.initProjectsDashboard = initProjectsDashboard;
window.initProductRecommendations = initProductRecommendations;

document.getElementById('hero-build-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  openStartProjectModal();
});

