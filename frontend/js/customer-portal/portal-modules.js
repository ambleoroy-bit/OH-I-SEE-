// OH I SEE — Customer Portal section modules (quotes, materials, payments, etc.)
(function (root) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  const INR = '\u20B9';
  const C = () => root.CustomerPortalConstants;
  const PCtx = () => root.PortalProjectContext;

  function fmtMoney(n) {
    const v = parseFloat(String(n).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(v) || v <= 0) return '\u2014';
    return `${INR}${v.toLocaleString('en-IN')}`;
  }

  function fmtDate(d) {
    if (!d) return '\u2014';
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  function projectHeader(project) {
    const ctx = project.construction_context || {};
    const ps = ctx.projectSetup || {};
    return `
      <div class="cp-project-banner">
        <div>
          <p class="cp-kicker">${esc(project.project_name || 'Project')}</p>
          <h1 class="cp-banner-title">${esc(project.project_id)}</h1>
          <p class="cp-banner-sub">${esc(project.project_type || ps.project_type || 'Project')} &middot; ${esc(project.location || '')}</p>
        </div>
        <div class="cp-banner-stats">
          <div><span class="cp-stat-label">Step</span><strong>${project.workflow_step || 1} / 8</strong></div>
          <div><span class="cp-stat-label">Status</span><strong>${esc(project.status_label || project.status || 'Draft')}</strong></div>
          <div><span class="cp-stat-label">Progress</span><strong>${project.completion_percentage ?? project.progress_pct ?? 0}%</strong></div>
        </div>
      </div>`;
  }

  async function renderQuotesPage(el, state, project) {
    return root.MarketplaceUI.renderComparison(el, state.projectId || project.project_id);
  }

  async function renderMaterialsPage(el, state, project) {
    el.innerHTML = '<div class="cp-loading">Loading material orders...</div>';
    const pid = state.projectId;
    try {
      const { data } = await PortalAPI.getMaterialOrders(pid);
      const orders = data.orders || data || [];
      const dash = data.dashboard || {};
      const reqs = data.requirements || [];

      el.innerHTML = `
        ${projectHeader(project)}
        <section class="cp-module-section">
          <h2 class="cp-section-title">Material Budget</h2>
          <div class="cp-stat-grid">
            <div class="cp-stat-card"><span class="cp-stat-label">Material Budget</span><span class="cp-stat-value">${fmtMoney(dash.material_budget || project.budget)}</span></div>
            <div class="cp-stat-card"><span class="cp-stat-label">Committed</span><span class="cp-stat-value">${fmtMoney(dash.committed)}</span></div>
            <div class="cp-stat-card"><span class="cp-stat-label">Ordered</span><span class="cp-stat-value">${fmtMoney(dash.ordered)}</span></div>
            <div class="cp-stat-card"><span class="cp-stat-label">Remaining</span><span class="cp-stat-value">${fmtMoney(dash.remaining)}</span></div>
          </div>
          ${dash.budget_warning ? `<div class="cp-alert warn">${esc(dash.budget_warning)}</div>` : ''}
        </section>
        ${reqs.length ? `<section class="cp-module-section"><h2 class="cp-section-title">Material Requirements</h2>
          <table class="cp-table"><thead><tr><th>Material</th><th>Required</th><th>Ordered</th><th>Delivered</th><th>Pending</th></tr></thead>
          <tbody>${reqs.map((r) => `<tr>
            <td>${esc(r.material_name || r.category)}</td>
            <td>${r.required_qty} ${esc(r.unit)}</td>
            <td>${r.ordered_qty} ${esc(r.unit)}</td>
            <td>${r.delivered_qty || 0} ${esc(r.unit)}</td>
            <td>${Math.max(0, (r.required_qty || 0) - (r.ordered_qty || 0))} ${esc(r.unit)}</td>
          </tr>`).join('')}</tbody></table></section>` : ''}
        <section class="cp-module-section">
          <h2 class="cp-section-title">Material Orders</h2>
          ${orders.length ? `<table class="cp-table"><thead><tr><th>Order</th><th>Supplier</th><th>Category</th><th>Product</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${orders.map((o) => `<tr>
            <td>${esc(o.order_ref)}</td><td>${esc(o.supplier || '\u2014')}</td><td>${esc(o.category)}</td>
            <td>${esc(o.product_name)}</td><td>${o.quantity} ${esc(o.unit)}</td>
            <td>${fmtMoney(o.total_amount)}</td><td><span class="cp-badge">${esc(o.order_status)}</span></td>
          </tr>`).join('')}</tbody></table>`
            : `<div class="cp-empty"><p>No material orders yet.</p><p class="cp-hint">Material requirements will appear after your BOQ is finalized.</p></div>`}
        </section>
        ${(data.budget_approvals || []).length ? `<section class="cp-module-section"><h2 class="cp-section-title">Budget Approval Requests</h2>
          ${data.budget_approvals.map((a) => `<div class="cp-alert warn">
            <strong>${esc(a.reason || 'Over-budget request')}</strong> — Additional ${fmtMoney(a.additional_amount)}
            <div class="cp-project-card-actions" style="margin-top:8px">
              <button type="button" class="cp-btn cp-btn-primary" data-approve-budget="${a.id}">Approve</button>
              <button type="button" class="cp-btn" data-reject-budget="${a.id}">Reject</button>
            </div></div>`).join('')}</section>` : ''}`;

      el.querySelectorAll('[data-approve-budget]').forEach((b) => {
        b.addEventListener('click', async () => {
          await PortalAPI.decideBudgetApproval(pid, b.dataset.approveBudget, 'approved');
          renderMaterialsPage(el, state, project);
        });
      });
      el.querySelectorAll('[data-reject-budget]').forEach((b) => {
        b.addEventListener('click', async () => {
          await PortalAPI.decideBudgetApproval(pid, b.dataset.rejectBudget, 'rejected');
          renderMaterialsPage(el, state, project);
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="cp-alert error">${esc(err.message)}</div>`;
    }
  }

  async function renderPaymentsPage(el, state, project) {
    el.innerHTML = '<div class="cp-loading">Loading payments...</div>';
    const pid = state.projectId;
    try {
      const { data } = await PortalAPI.getPayments(pid);
      const payments = data.payments || [];
      const milestones = data.milestones || [];

      el.innerHTML = `
        ${projectHeader(project)}
        <div class="cp-stat-grid">
          <div class="cp-stat-card"><span class="cp-stat-label">Total Project Value</span><span class="cp-stat-value">${fmtMoney(data.contract_value)}</span></div>
          <div class="cp-stat-card"><span class="cp-stat-label">Amount Paid</span><span class="cp-stat-value">${fmtMoney(data.total_paid)}</span></div>
          <div class="cp-stat-card"><span class="cp-stat-label">Pending</span><span class="cp-stat-value">${fmtMoney(data.pending)}</span></div>
          <div class="cp-stat-card"><span class="cp-stat-label">Overdue</span><span class="cp-stat-value">${fmtMoney(data.overdue || 0)}</span></div>
        </div>
        ${milestones.length ? `<section class="cp-module-section"><h2 class="cp-section-title">Milestone Payments</h2>
          <table class="cp-table"><thead><tr><th>Milestone</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>${milestones.map((m) => `<tr>
            <td>${esc(m.milestone || m.stage)}</td><td>${fmtMoney(m.amount)}</td>
            <td>${fmtDate(m.due_date || m.expected_date)}</td><td><span class="cp-badge">${esc(m.payment_status || m.status)}</span></td>
          </tr>`).join('')}</tbody></table></section>` : ''}
        <section class="cp-module-section">
          <h2 class="cp-section-title">Payment History</h2>
          ${payments.length ? `<table class="cp-table"><thead><tr><th>Invoice</th><th>Description</th><th>Recipient</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>${payments.map((p) => `<tr>
            <td>${esc(p.payment_ref)}</td><td>${esc(p.description || p.milestone)}</td>
            <td>${esc(p.recipient || p.payment_method || '\u2014')}</td>
            <td>${fmtMoney(p.amount)}</td><td>${fmtDate(p.due_date)}</td>
            <td><span class="cp-badge">${esc(p.status)}</span></td>
          </tr>`).join('')}</tbody></table>`
            : `<div class="cp-empty"><p>No payments yet.</p><p class="cp-hint">Payments will appear when a builder or supplier invoice is generated.</p></div>`}
        </section>`;
    } catch (err) {
      el.innerHTML = `<div class="cp-alert error">${esc(err.message)}</div>`;
    }
  }

  async function renderMessagesPage(el, state, project) {
    try {
      const {data} = await root.MarketplaceUI.api('/projects/'+encodeURIComponent(state.projectId || project.project_id)+'/comparison');
      if(data.job) return root.MarketplaceUI.renderJob(el,data.job.id);
    } catch(e) { el.innerHTML = `<div class="cp-alert error">${esc(e.message)}</div>`; return; }

    el.innerHTML = '<div class="cp-loading">Loading messages...</div>';
    const pid = state.projectId;
    try {
      const { data } = await PortalAPI.getMessages(pid);
      const messages = data.messages || data || [];
      const unread = messages.filter((m) => !m.read_at && m.sender_role !== 'customer').length;

      el.innerHTML = `
        ${projectHeader(project)}
        <div class="cp-messages-header">
          <span>${messages.length} messages</span>
          ${unread ? `<span class="cp-badge">${unread} unread</span>` : ''}
          <span class="cp-hint">Project: ${esc(project.project_name)}</span>
        </div>
        <div class="cp-messages" id="cp-messages-list">
          ${messages.length ? messages.map((m) => `
            <div class="cp-message ${m.sender_role === 'customer' ? 'mine' : ''}">
              <div class="cp-message-meta">${esc(m.sender_name)} (${esc(m.sender_role || 'user')}) &middot; ${fmtDate(m.created_at)}</div>
              <div class="cp-message-body">${esc(m.body)}</div>
            </div>`).join('')
            : `<div class="cp-empty"><p>No conversations yet.</p><p class="cp-hint">Project conversations will appear when builders, suppliers or project experts contact you.</p></div>`}
        </div>
        <form id="cp-message-form" class="cp-message-form">
          <textarea id="cp-message-input" rows="3" placeholder="Write a message to your builder or site engineer..."></textarea>
          <button type="submit" class="cp-btn cp-btn-primary">Send</button>
        </form>`;

      document.getElementById('cp-message-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = document.getElementById('cp-message-input')?.value?.trim();
        if (!body) return;
        await PortalAPI.sendMessage(pid, { body, receiver_role: 'builder' });
        renderMessagesPage(el, state, project);
      });
    } catch (err) {
      el.innerHTML = `<div class="cp-alert error">${esc(err.message)}</div>`;
    }
  }

  async function renderSiteUpdatesPage(el, state, project) {
    try { const {data:jobs}=await MarketplaceUI.api('/jobs');const job=jobs.find(j=>j.project_id===state.projectId&&j.data.stage==='in_execution');if(job){await MarketplaceUI.renderJob(el,job.id);return;} } catch(e){el.innerHTML='<p class="cp-alert error">'+esc(e.message)+'</p>';return;}
    el.innerHTML = '<div class="cp-loading">Loading site updates...</div>';
    const pid = state.projectId;
    try {
      const { data } = await PortalAPI.getSiteUpdates(pid);
      const updates = data.updates || data.data || [];
      const milestones = data.milestones || [];
      const issues = data.issues || [];
      const progress = data.overall_progress ?? 0;

      el.innerHTML = `
        ${projectHeader(project)}
        <div class="cp-stat-card" style="margin-bottom:20px">
          <span class="cp-stat-label">Overall Progress</span>
          <span class="cp-stat-value">${progress}%</span>
          <div class="dh-ready-bar" style="margin-top:8px"><div class="dh-ready-fill" style="width:${progress}%"></div></div>
        </div>
        <section class="cp-module-section">
          <h2 class="cp-section-title">Construction Stages</h2>
          <div class="cp-milestone-list">${milestones.map((m) => `
            <div class="cp-milestone ${esc(m.status)}">
              <div><strong>${esc(m.stage)}</strong><br><small>${esc(m.status)} &middot; ${m.progress_pct || 0}%</small></div>
            </div>`).join('')}</div>
        </section>
        <section class="cp-module-section">
          <h2 class="cp-section-title">Site Updates</h2>
          ${updates.length ? updates.map((u) => `
            <article class="cp-update-card">
              <div class="cp-message-meta">${fmtDate(u.created_at)} &middot; ${esc(u.stage || '')} ${u.author_name ? `&middot; ${esc(u.author_name)}` : ''}</div>
              <p>${esc(u.description || '')}</p>
              ${u.completion_pct != null ? `<p class="cp-hint">Progress: ${u.completion_pct}%</p>` : ''}
              ${(u.photos || []).length ? `<div class="cp-photo-grid">${(u.photos || []).slice(0, 4).map((p) => `<img src="${esc(typeof p === 'string' ? p : p.url)}" alt="Site photo" loading="lazy">`).join('')}</div>` : ''}
            </article>`).join('')
            : `<div class="cp-empty"><p>No site updates yet.</p><p class="cp-hint">Site progress updates will appear after project execution begins.</p></div>`}
        </section>
        ${issues.length ? `<section class="cp-module-section"><h2 class="cp-section-title">Site Issues</h2>
          ${issues.map((i) => `<div class="cp-alert ${i.severity === 'high' ? 'error' : 'warn'}">
            <strong>${esc(i.title)}</strong> (${esc(i.category)}) — ${esc(i.status)}
            <p>${esc(i.description || '')}</p>
          </div>`).join('')}</section>` : ''}`;
    } catch (err) {
      el.innerHTML = `<div class="cp-alert error">${esc(err.message)}</div>`;
    }
  }

  async function renderHandoverPage(el, state, project) {
    try { const {data:jobs}=await MarketplaceUI.api('/jobs');const job=jobs.find(j=>j.project_id===state.projectId&&j.data.stage==='in_execution');if(job){await MarketplaceUI.renderJob(el,job.id);return;} } catch(e){el.innerHTML='<p class="cp-alert error">'+esc(e.message)+'</p>';return;}
    el.innerHTML = '<div class="cp-loading">Loading handover documents...</div>';
    const pid = state.projectId;
    try {
      const { data } = await PortalAPI.getHandover(pid);
      const docs = data.documents || [];
      const checklist = data.checklist?.items || data.checklist_items || {};
      const snags = data.snags || [];

      const checklistItems = Object.keys(checklist).length
        ? Object.entries(checklist)
        : C().HANDOVER_DOC_TYPES.slice(0, 10).map((t) => [t, docs.some((d) => d.doc_type === t) ? 'Completed' : 'Pending']);

      el.innerHTML = `
        ${projectHeader(project)}
        <section class="cp-module-section">
          <h2 class="cp-section-title">Handover Checklist</h2>
          <ul class="cp-doc-type-list">${checklistItems.map(([item, status]) => `
            <li class="${status === 'Completed' ? 'ok' : ''}">${esc(item)} <span class="cp-badge">${esc(status)}</span></li>`).join('')}</ul>
        </section>
        <section class="cp-module-section">
          <h2 class="cp-section-title">Documents (${docs.length})</h2>
          ${docs.length ? `<table class="cp-table"><thead><tr><th>Document</th><th>Category</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
          <tbody>${docs.map((d) => `<tr>
            <td>${esc(d.file_name)}</td><td>${esc(d.doc_type)}</td>
            <td>${fmtDate(d.uploaded_at)}</td><td>${esc(d.status)}</td>
            <td>${d.storage_path || d.file_url ? `<a class="cp-btn" href="${esc(d.storage_path || d.file_url)}" target="_blank" rel="noopener">Download</a>` : ''}</td>
          </tr>`).join('')}</tbody></table>`
            : `<div class="cp-empty"><p>Handover documents are not available yet.</p><p class="cp-hint">They will appear when your project reaches the handover stage.</p></div>`}
        </section>
        ${snags.length ? `<section class="cp-module-section"><h2 class="cp-section-title">Snag List</h2>
          <table class="cp-table"><thead><tr><th>Location</th><th>Issue</th><th>Severity</th><th>Status</th></tr></thead>
          <tbody>${snags.map((s) => `<tr><td>${esc(s.location)}</td><td>${esc(s.description)}</td>
            <td>${esc(s.severity)}</td><td>${esc(s.status)}</td></tr>`).join('')}</tbody></table></section>` : ''}`;
    } catch (err) {
      el.innerHTML = `<div class="cp-alert error">${esc(err.message)}</div>`;
    }
  }

  async function renderDashboardPage(el, state) {
    el.innerHTML = '<div class="cp-loading">Loading dashboard...</div>';
    try {
      const { data } = await PortalAPI.getDashboard();
      const projects = data.projects || [];
      const pid = state.projectId || PCtx().resolveProjectId();
      let active = null;
      if (pid) {
        const loaded = await PCtx().loadProject(pid);
        if (loaded.ok) active = loaded.project;
      }
      if (!active) active = projects[0] || null;

      el.innerHTML = `
        <div class="cp-page-header"><h1>Dashboard</h1><p>Your construction projects at a glance</p></div>
        ${active ? projectHeader(active) : ''}
        <div class="cp-stat-grid">
          <div class="cp-stat-card"><span class="cp-stat-label">Active Projects</span><span class="cp-stat-value">${data.active_projects || 0}</span></div>
          <div class="cp-stat-card"><span class="cp-stat-label">Pending Approvals</span><span class="cp-stat-value">${data.pending_approvals || 0}</span></div>
          <div class="cp-stat-card"><span class="cp-stat-label">Total Budget</span><span class="cp-stat-value">${fmtMoney(data.total_budget)}</span></div>
        </div>
        <section class="cp-section">
          <h2 class="cp-section-title">Quick Actions</h2>
          <div class="cp-quick-actions">
            <a class="cp-btn cp-btn-primary" href="intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1">Create New Project</a>
            ${active ? `<a class="cp-btn" href="customer-portal.html?view=workflow&step=${active.workflow_step || 1}&projectId=${encodeURIComponent(active.project_id)}">Continue Project</a>` : ''}
            <a class="cp-btn" href="customer-portal.html?view=projects">My Projects</a>
            ${active ? `<a class="cp-btn" href="customer-portal.html?view=quotes&projectId=${encodeURIComponent(active.project_id)}">Builder Quotes</a>` : ''}
            ${active ? `<a class="cp-btn" href="customer-portal.html?view=messages&projectId=${encodeURIComponent(active.project_id)}">Messages</a>` : ''}
          </div>
        </section>
        <section class="cp-section">
          <h2 class="cp-section-title">Recent Projects</h2>
          ${projects.length ? `<div class="cp-project-grid">${projects.slice(0, 6).map((p) => `
            <article class="cp-project-card">
              <h3>${esc(p.project_name)}</h3>
              <p>${esc(p.project_id)} &middot; ${p.completion_percentage || 0}%</p>
              <a class="cp-btn cp-btn-primary" href="customer-portal.html?view=workflow&step=${p.workflow_step || 1}&projectId=${encodeURIComponent(p.project_id)}">Open</a>
            </article>`).join('')}</div>`
            : `<div class="cp-empty"><p>No projects yet.</p><a class="cp-btn cp-btn-primary" href="intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1">Start Your First Project</a></div>`}
        </section>`;
    } catch (err) {
      el.innerHTML = `<div class="cp-alert error">${esc(err.message)}</div>`;
    }
  }

  root.PortalModules = {
    renderQuotesPage,
    renderMaterialsPage,
    renderPaymentsPage,
    renderMessagesPage,
    renderSiteUpdatesPage,
    renderHandoverPage,
    renderDashboardPage,
    projectHeader,
  };
})(typeof window !== 'undefined' ? window : global);
