// OH I SEE — Design & Engineering step (Step 4)
(function (root) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

  const DESIGN_PACKAGES = [
    '2D Floor Plan', '3D Exterior', '3D Interior', 'Structural Design', 'Electrical Design',
    'Plumbing Design', 'HVAC Design', 'Landscape Design', 'MEP Design', 'BIM Model', 'BOQ / Quantity Takeoff',
  ];

  const AI_CHECKLIST = [
    '2D Floor Plan', 'Room Schedule', '3D Exterior & Interior Views', 'Area Statement',
    'Structural Drawings', 'Initial BOQ', 'Preliminary Cost Estimate',
  ];

  const PREF_FIELDS = [
    { key: 'arch_style', label: 'Architectural Style', options: ['Modern', 'Contemporary', 'Traditional', 'Minimalist', 'Colonial'] },
    { key: 'exterior_material', label: 'Exterior Material Preference', options: ['Concrete + Glass', 'Brick + Plaster', 'Stone Cladding', 'Wood Finish'] },
    { key: 'roof_type', label: 'Roof Type', options: ['RCC Flat Roof', 'Sloped Tile Roof', 'Metal Roof'] },
    { key: 'window_style', label: 'Window Style', options: ['Sliding', 'Casement', 'Fixed Glass', 'UPVC'] },
    { key: 'door_style', label: 'Door Style', options: ['Wooden', 'Flush', 'Panel', 'Glass'] },
    { key: 'flooring_pref', label: 'Flooring Preference', options: ['Vitrified Tiles', 'Marble', 'Wooden', 'Granite'] },
    { key: 'wall_finish', label: 'Wall Finish', options: ['Paint with Texture', 'Plain Paint', 'Wallpaper'] },
    { key: 'kitchen_style', label: 'Kitchen Style', options: ['Modular', 'Semi-modular', 'Open Kitchen'] },
    { key: 'bathroom_style', label: 'Bathroom Style', options: ['Modern', 'Classic', 'Luxury'] },
    { key: 'lighting_pref', label: 'Lighting Preference', options: ['LED Warm White', 'LED Cool White', 'Mixed'] },
    { key: 'color_pref', label: 'Color Preference', options: ['Neutral Tones', 'Warm Tones', 'Cool Tones', 'Bold Accents'] },
  ];

  const APPROVAL_STATUSES = ['Pending', 'Approved', 'Changes Requested', 'Rejected'];

  function defaults(ctx = {}) {
    const req = ctx.requirements || {};
    return {
      packages: ['2D Floor Plan', '3D Exterior', 'BOQ / Quantity Takeoff'],
      preferences: {
        arch_style: req.arch_style || 'Modern',
        exterior_material: req.exterior_wall || 'Concrete + Glass',
        roof_type: req.roof_type || 'RCC Flat Roof',
        window_style: req.window_style || 'Sliding',
        door_style: req.door_style || 'Wooden',
        flooring_pref: req.flooring_pref || 'Vitrified Tiles',
        wall_finish: req.wall_finish || 'Paint with Texture',
        kitchen_style: req.kitchen_style || 'Modular',
        bathroom_style: req.bathroom_style || 'Modern',
        lighting_pref: 'LED Warm White',
        color_pref: 'Neutral Tones',
        other_preferences: '',
      },
      selected_version_id: '',
      approval_status: 'Pending',
      approval_date: '',
      approval_comments: '',
      design_documents: [],
      requirements_stale: false,
      requirements_hash: ctx.requirements_hash || '',
    };
  }

  function validate(state, versions = []) {
    const errors = {};
    if (!state.packages?.length) errors.packages = 'Select at least one design package.';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function selectOpts(list, val) {
    return list.map((o) => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }

  function fmtMoney(n) {
    const v = parseFloat(String(n).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(v) || v <= 0) return '—';
    return `\u20B9${v.toLocaleString('en-IN')}`;
  }

  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  function renderForm(state, versions = [], errors = {}, bimStatus = '') {
    const prefs = state.preferences || {};
    const docs = (state.design_documents || []).map((doc, i) => `
      <div class="ps-doc-row" data-doc-index="${i}">
        <span class="ps-doc-icon ps-doc-icon-pdf">DOC</span>
        <span class="ps-doc-name">${esc(doc.file_name)}</span>
        <span class="ps-doc-size">${doc.file_size ? Math.round(doc.file_size / 1024) + ' KB' : ''}</span>
        <button type="button" class="ps-doc-remove" data-de-remove-doc="${i}">\u00D7</button>
      </div>`).join('');

    return `
      <form id="design-engineering-form" class="ps-form de-form" novalidate>
        <div class="rq-page-head">
          <div>
            <p class="cp-kicker">STEP 4 OF 8</p>
            <h2 class="rq-title">Design &amp; Engineering</h2>
            <p class="rq-subtitle">Generate 2D floor plans, 3D visualization, engineering designs and BOQ from your saved requirements.</p>
          </div>
          <span class="rq-autosave-badge">Auto-saved</span>
        </div>

        ${state.requirements_stale ? `<div class="rq-budget-warn">
          <strong>Your requirements have changed.</strong> The current design may no longer match your requirements.
          <div class="rq-budget-warn-actions">
            <button type="button" class="cp-btn cp-btn-primary" id="de-regenerate">Regenerate Design</button>
            <button type="button" class="cp-btn" id="de-keep-design">Keep Existing Design</button>
          </div>
        </div>` : ''}

        <div class="de-info-box">
          <span class="de-info-icon">\uD83D\uDCA1</span>
          <p>Our AI creates design options based on your requirements and budget. Select packages below and generate design options.</p>
        </div>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">4.1 DESIGN PACKAGE (SELECT WHAT YOU NEED)</h3>
          <p class="rq-hint">Choose the design and engineering deliverables you want.</p>
          <div class="ps-section-body de-pkg-grid">
            ${DESIGN_PACKAGES.map((p) => `
              <label class="de-pkg-check ps-check">
                <input type="checkbox" data-de-pkg="${esc(p)}" ${(state.packages || []).includes(p) ? 'checked' : ''}>
                <span>${esc(p)}</span>
              </label>`).join('')}
          </div>${errors.packages ? `<div class="ps-field-error">${esc(errors.packages)}</div>` : ''}
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">4.2 DESIGN PREFERENCES</h3>
          <p class="rq-hint">Help us understand your style and material preferences.</p>
          <div class="ps-section-body ps-grid ps-grid-2">
            ${PREF_FIELDS.map((f) => `
              <div class="ps-field"><label>${esc(f.label)}</label>
                <select data-de-pref="${f.key}" data-ps-searchable>${selectOpts(f.options, prefs[f.key])}</select></div>`).join('')}
            <div class="ps-field rq-full"><label>Other Preferences</label>
              <input type="text" data-de-pref="other_preferences" value="${esc(prefs.other_preferences)}"></div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">4.3 AI DESIGN GENERATION</h3>
          <div class="ps-section-body de-gen-row">
            <div class="de-gen-col">
              <p class="de-gen-label">AI will generate:</p>
              <ul class="de-checklist">${AI_CHECKLIST.map((c) => `<li>\u2713 ${esc(c)}</li>`).join('')}</ul>
              <div class="de-generate-actions">
                <button type="button" class="de-generate-btn" id="de-generate">
                  <span class="de-generate-icon" aria-hidden="true">\u2728</span>
                  <span class="de-generate-label">Generate Design Options</span>
                </button>
              </div>
              <p class="rq-hint de-bim-status">BIM Status: <strong>${esc(bimStatus || 'none')}</strong></p>
            </div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">4.4 DESIGN VERSIONS</h3>
          <div class="ps-section-body de-versions-grid" id="de-versions-grid">
            ${versions.length ? versions.map((v) => `
              <article class="de-version-card ${state.selected_version_id === v.id ? 'selected' : ''}" data-version-id="${esc(v.id)}">
                <div class="de-version-thumb"><img src="/images/dream-home-preview.jpg" alt="Version ${v.version_number}"></div>
                <div class="de-version-body">
                  <div class="de-version-head">
                    <strong>Version ${v.version_number}</strong>
                    <span class="cp-badge de-status-${esc((v.status || 'draft').toLowerCase())}">${esc(v.status || 'Generated')}</span>
                  </div>
                  <p class="de-version-meta">Created: ${fmtDate(v.created_at)}</p>
                  <p class="de-version-meta">Style: ${esc(v.preferences?.arch_style || prefs.arch_style || 'Modern')}</p>
                  <p class="de-version-meta">Area: ${esc(v.boq_snapshot?.total_area || '—')} sq.ft</p>
                  <p class="de-version-meta">Est. Cost: ${fmtMoney(v.cost_estimate)}</p>
                  <div class="de-version-actions">
                    <a class="cp-btn" href="project-floor-plan.html?projectId=${encodeURIComponent(v.project_id || '')}">View</a>
                    <a class="cp-btn" href="quote-compare.html?projectId=${encodeURIComponent(v.project_id || root._ohiseeLinkedProjectId || '')}">Compare builders</a>
                    <button type="button" class="cp-btn" data-de-request-changes="${esc(v.id)}">Request Changes</button>
                  </div>
                </div>
              </article>`).join('') : '<p class="cp-empty">No design versions yet. Click Generate Design Options.</p>'}
          </div>${errors.versions ? `<div class="ps-field-error">${esc(errors.versions)}</div>` : ''}
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">4.5 CUSTOMER APPROVAL</h3>
          <div class="ps-section-body ps-grid ps-grid-2">
            <div class="ps-field"><label>Selected Design Version</label>
              <select data-de-field="selected_version_id" data-ps-searchable>
                <option value="">— Select —</option>
                ${versions.map((v) => `<option value="${esc(v.id)}" ${state.selected_version_id === v.id ? 'selected' : ''}>Version ${v.version_number}</option>`).join('')}
              </select>${errors.selected_version ? `<div class="ps-field-error">${esc(errors.selected_version)}</div>` : ''}</div>
            <div class="ps-field"><label>Approval Status</label>
              <select data-de-field="approval_status" data-ps-searchable>${selectOpts(APPROVAL_STATUSES, state.approval_status)}</select></div>
            <div class="ps-field"><label>Approval Date</label>
              <input type="date" data-de-field="approval_date" value="${esc(state.approval_date)}"></div>
            <div class="ps-field rq-full"><label>Comments</label>
              <textarea data-de-field="approval_comments" rows="3">${esc(state.approval_comments)}</textarea></div>
          </div>${errors.approval ? `<div class="ps-field-error">${esc(errors.approval)}</div>` : ''}
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">4.6 DESIGN DOCUMENTS</h3>
          <div class="ps-section-body de-docs-row">
            <div class="ps-upload-zone" id="de-upload-zone">
              <p><strong>Drag &amp; drop files here or click to upload</strong></p>
              <p class="ps-upload-hint">PDF, DWG, images — max 25 MB</p>
              <input type="file" id="de-file-input" multiple accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf" hidden>
            </div>
            <div class="ps-doc-list" id="de-doc-list">${docs || '<p class="ps-doc-empty">No design documents uploaded.</p>'}</div>
          </div>
        </section>
      </form>`;
  }

  function readFormState(formEl, prev) {
    const state = { ...prev, preferences: { ...(prev.preferences || {}) } };
    formEl.querySelectorAll('[data-de-field]').forEach((el) => { state[el.dataset.deField] = el.value; });
    formEl.querySelectorAll('[data-de-pref]').forEach((el) => { state.preferences[el.dataset.dePref] = el.value; });
    state.packages = [...formEl.querySelectorAll('[data-de-pkg]:checked')].map((c) => c.dataset.dePkg);
    state.design_documents = prev.design_documents || [];
    return state;
  }

  function bindForm(container, state, callbacks = {}) {
    const form = container.querySelector('#design-engineering-form');
    if (!form) return;
    if (root.SearchableSelect) root.SearchableSelect.enhanceAll(container);

    const sync = () => { Object.assign(state, readFormState(form, state)); callbacks.onChange?.(state); };
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);

    container.querySelector('#de-generate')?.addEventListener('click', () => callbacks.onGenerate?.(state));
    container.querySelector('#de-regenerate')?.addEventListener('click', () => callbacks.onRegenerate?.(state));
    container.querySelector('#de-keep-design')?.addEventListener('click', () => {
      state.requirements_stale = false;
      callbacks.onChange?.(state);
      container.querySelector('.rq-budget-warn')?.remove();
    });

    container.querySelectorAll('[data-version-id]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        state.selected_version_id = card.dataset.versionId;
        if (!state.approval_status || state.approval_status === 'Pending') {
          state.approval_status = 'Approved';
          const appSel = form.querySelector('[data-de-field="approval_status"]');
          if (appSel) { appSel.value = 'Approved'; if (root.SearchableSelect) root.SearchableSelect.refresh(appSel); }
        }
        container.querySelectorAll('.de-version-card').forEach((c) => c.classList.toggle('selected', c.dataset.versionId === state.selected_version_id));
        const sel = form.querySelector('[data-de-field="selected_version_id"]');
        if (sel) { sel.value = state.selected_version_id; if (root.SearchableSelect) root.SearchableSelect.refresh(sel); }
        callbacks.onChange?.(state);
      });
    });

    container.querySelectorAll('[data-de-request-changes]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.approval_status = 'Changes Requested';
        state.selected_version_id = btn.dataset.deRequestChanges;
        const sel = form.querySelector('[data-de-field="approval_status"]');
        if (sel) sel.value = 'Changes Requested';
        callbacks.onChange?.(state);
        callbacks.onRequestChanges?.(state);
      });
    });

    const zone = container.querySelector('#de-upload-zone');
    const fileInput = container.querySelector('#de-file-input');
    if (zone && fileInput) {
      zone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => { callbacks.onFiles?.(fileInput.files); fileInput.value = ''; });
    }

    container.querySelectorAll('[data-de-remove-doc]').forEach((btn) => {
      btn.addEventListener('click', () => callbacks.onRemoveDoc?.(parseInt(btn.dataset.deRemoveDoc, 10)));
    });
  }

  function buildBimPayload(projectId, setup, land, requirements, designState) {
    return {
      label: 'Design generation from customer requirements',
      project_id: projectId,
      project_type: requirements.project_type,
      plot_length: land?.plot_length_ft,
      plot_width: land?.plot_width_ft,
      setbacks: {
        front: land?.setback_front_ft, rear: land?.setback_rear_ft,
        left: land?.setback_left_ft, right: land?.setback_right_ft,
      },
      floors: requirements.floors,
      built_up_area: requirements.built_up_area,
      bedrooms: requirements.qty_bedrooms,
      bathrooms: requirements.qty_bathrooms,
      room_quantities: requirements,
      room_sizes: {
        master: requirements.size_master_bedroom, bedroom2: requirements.size_bedroom_2,
        living: requirements.size_living, kitchen: requirements.size_kitchen,
      },
      parking: requirements.car_parking,
      vastu: requirements.follow_vastu,
      arch_style: designState.preferences?.arch_style || requirements.arch_style,
      interior_style: requirements.interior_style,
      features: requirements.home_features,
      budget: requirements.budget || setup?.estimated_budget,
      special_requirements: requirements.special_requirements,
      packages: designState.packages,
      preferences: designState.preferences,
    };
  }

  root.DesignEngineeringStep = {
    defaults, validate, renderForm, bindForm, readFormState, buildBimPayload, DESIGN_PACKAGES,
  };
})(typeof window !== 'undefined' ? window : global);
