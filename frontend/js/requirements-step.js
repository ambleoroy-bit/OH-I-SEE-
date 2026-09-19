// OH I SEE — Requirements step (Step 3) — full portal UI
(function (root) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  const M = () => root.RequirementsStepModel;

  const icon = (key) => (root.RequirementsIcons ? root.RequirementsIcons.get(key) : '');

  function fieldErr(errors, key) {
    return errors?.[key] ? `<div class="ps-field-error">${esc(errors[key])}</div>` : '';
  }

  function selectOpts(list, val) {
    return list.map((o) => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }

  const QTY_MINUS_ICON = '<svg class="rq-qty-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  const QTY_PLUS_ICON = '<svg class="rq-qty-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

  function qtyHiddenInput(box, key) {
    const field = box.closest('.rq-qty-field');
    return field?.querySelector(`input[data-req-field="${key}"]`);
  }

  function roomQuantityField(key, val, required = false, errors = {}) {
    const label = M().ROOM_FIELDS.find((r) => r.key === key)?.label || key;
    const v = parseInt(val, 10) || 0;
    return `<div class="rq-qty-field quantity-field">
      <label class="rq-label">${esc(label)}${required ? ' <span class="req">*</span>' : ''}</label>
      <div class="quantity-control rq-qty-control" data-rq-counter="${key}">
        <button type="button" class="quantity-minus rq-qty-btn" data-rq-dec aria-label="Decrease ${esc(label)}">${QTY_MINUS_ICON}</button>
        <span class="quantity-value rq-qty-value" data-rq-val>${v}</span>
        <button type="button" class="quantity-plus rq-qty-btn" data-rq-inc aria-label="Increase ${esc(label)}">${QTY_PLUS_ICON}</button>
      </div>
      <input type="hidden" data-req-field="${key}" value="${v}">
      ${fieldErr(errors, key)}
    </div>`;
  }

  function projectTypeCard(type, selected) {
    return `<button type="button" class="rq-type-card ${selected ? 'selected' : ''}" data-req-type="${esc(type.value)}" aria-pressed="${selected ? 'true' : 'false'}">
      <span class="rq-type-icon-wrap">${icon(type.icon)}</span>
      <span class="rq-type-label">${esc(type.value)}</span>
    </button>`;
  }

  function renderForm(req, errors = {}, setup = {}) {
    const model = M();
    const b = model.budgetAllocation(req);
    const totalBudget = model.parseNum(setup.estimated_budget || req.total_project_budget);
    const budgetFmt = totalBudget ? `\u20B9${totalBudget.toLocaleString('en-IN')}` : 'from Project Setup';

    const refs = (req.reference_files || []).map((doc, i) => `
      <div class="ps-doc-row" data-ref-index="${i}">
        <span class="ps-doc-icon ps-doc-icon-pdf">${doc.mime_type?.includes('image') ? 'IMG' : 'DOC'}</span>
        <span class="ps-doc-name">${esc(doc.file_name)}</span>
        <span class="ps-doc-size">${doc.file_size ? Math.round(doc.file_size / 1024) + ' KB' : ''}</span>
        <button type="button" class="ps-doc-remove" data-req-remove-ref="${i}">\u00D7</button>
      </div>`).join('');

    const customRooms = (req.custom_rooms || []).map((r, i) => `
      <div class="rq-custom-row" data-custom-idx="${i}">
        <span>${esc(r.name)} (${esc(r.qty)})</span>
        <button type="button" class="ps-doc-remove" data-req-remove-custom="${i}">\u00D7</button>
      </div>`).join('');

    return `
      <form id="requirements-form" class="ps-form rq-form" novalidate>
        <div class="rq-page-head">
          <div>
            <p class="cp-kicker">STEP 3 OF 8</p>
            <h2 class="rq-title">Project Requirements</h2>
            <p class="rq-subtitle">Tell us what you need. This helps create the perfect design, estimate and match the right builders for you.</p>
          </div>
          <span class="rq-autosave-badge">Auto-saved</span>
        </div>

        ${errors.budget_allocation ? `<div class="rq-budget-warn" id="rq-budget-warn">
          <strong>Your current allocation exceeds the project budget.</strong>
          <p>Total allocation: \u20B9${b.total.toLocaleString('en-IN')} vs project budget: ${budgetFmt}</p>
          <div class="rq-budget-warn-actions">
            <button type="button" class="cp-btn" id="rq-budget-adjust">Adjust Budget Allocation</button>
            <button type="button" class="cp-btn cp-btn-primary" id="rq-budget-approve">Continue with Customer Approval</button>
          </div>
        </div>` : ''}

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.1 Basic Requirements</h3>
          <div class="ps-section-body">
            <div class="ps-grid ps-grid-2">
              <div class="ps-field"><label>Number of Floors <span class="req">*</span></label>
                <select data-req-field="floors" data-ps-searchable>${selectOpts(model.FLOOR_OPTIONS, req.floors)}</select>${fieldErr(errors, 'floors')}</div>
              <div class="ps-field"><label>Built-up Area (sq.ft) <span class="req">*</span></label>
                <input data-req-field="built_up_area" type="number" min="1" value="${esc(req.built_up_area)}">${fieldErr(errors, 'built_up_area')}</div>
              <div class="ps-field"><label>Construction Type <span class="req">*</span></label>
                <select data-req-field="construction_type" data-ps-searchable>${selectOpts(model.CONSTRUCTION_TYPES, req.construction_type)}</select>${fieldErr(errors, 'construction_type')}</div>
              <div class="ps-field"><label>Primary Usage <span class="req">*</span></label>
                <select data-req-field="primary_usage" data-ps-searchable>${selectOpts(model.PRIMARY_USAGE, req.primary_usage)}</select>${fieldErr(errors, 'primary_usage')}</div>
            </div>
            <div class="ps-field rq-full">
              <label class="rq-label">Project Type <span class="req">*</span></label>
              <div class="rq-type-grid" role="group" aria-label="Project Type">
                ${model.PROJECT_TYPES.map((t) => projectTypeCard(t, req.project_type === t.value)).join('')}
              </div>${fieldErr(errors, 'project_type')}
            </div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.2 Rooms &amp; Layout</h3>
          <div class="ps-section-body">
            <div class="rq-grid rq-grid-4">
              ${model.ROOM_FIELDS.map((r) => roomQuantityField(r.key, req[r.key], r.required, errors)).join('')}
            </div>
            <div class="rq-add-rooms-wrap">
              <button type="button" class="rq-add-rooms-btn" id="rq-add-rooms" aria-expanded="false">+ Add More Rooms</button>
            </div>
            <div class="rq-custom-panel" id="rq-custom-panel" hidden>
              <div class="rq-custom-room-row rq-add-room-form">
                <div class="ps-field">
                  <label class="rq-label">Room name</label>
                  <input type="text" id="rq-custom-name" placeholder="Room name">
                </div>
                <div class="ps-field">
                  <label class="rq-label">Quantity</label>
                  <input type="number" id="rq-custom-qty" min="1" value="1">
                </div>
                <div class="ps-field">
                  <label class="rq-label" aria-hidden="true">&nbsp;</label>
                  <button type="button" class="rq-btn-add" id="rq-custom-add">Add</button>
                </div>
              </div>
            </div>
            <div id="rq-custom-list">${customRooms}</div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.3 Room Details (Optional)</h3>
          <div class="ps-section-body">
            <p class="rq-hint">Sizes in sq.ft. Bedroom 2 size applies to each additional bedroom. Leave space for bathrooms, walls, stairs and circulation.</p><button type="button" class="rq-auto-calculate" id="rq-auto-calculate" style="display:inline-flex;align-items:center;background:#ffd400;color:#111;border:0;border-radius:10px;padding:14px 22px;margin:12px 0;font-size:16px;font-weight:700;cursor:pointer">Auto calculate room sizes</button><p id="rq-auto-result" class="rq-hint" role="status" aria-live="polite"></p><div id="rq-area-summary" role="status" aria-live="polite"></div><button type="button" id="rq-area-help" hidden style="color:#ffd400;background:transparent;border:1px solid #ffd400;border-radius:8px;padding:10px 16px;margin:8px 0 16px;cursor:pointer">ⓘ How to fix this warning</button>
            <div class="rq-grid rq-grid-4">
              ${model.ROOM_SIZE_FIELDS.map((f) => `
                <div class="ps-field">
                  <label class="rq-label">${esc(f.label)}</label>
                  <input data-req-field="${f.key}" type="number" min="0" placeholder="sq.ft" value="${esc(req[f.key])}"><div data-room-error="${f.key}" class="ps-field-error">${esc(errors[f.key] || '')}</div>
                </div>`).join('')}
            </div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.4 Parking &amp; Vehicles</h3>
          <div class="ps-section-body">
            <div class="ps-grid ps-grid-4">
              <div class="ps-field"><label>Car Parking</label>
                <input data-req-field="car_parking" type="number" min="0" value="${esc(req.car_parking)}"></div>
              <div class="ps-field"><label>Two Wheeler Parking</label>
                <input data-req-field="two_wheeler_parking" type="number" min="0" value="${esc(req.two_wheeler_parking)}"></div>
              <div class="ps-field"><label>Covered Parking</label>
                <select data-req-field="covered_parking" data-ps-searchable>${selectOpts(['Yes', 'No', 'Partial'], req.covered_parking)}</select></div>
              <div class="ps-field"><label>EV Charging</label>
                <select data-req-field="ev_charging" data-ps-searchable>${selectOpts(['Yes', 'No', 'Future Provision'], req.ev_charging)}</select></div>
            </div>
            <div class="ps-features rq-check-grid">
              ${model.PARKING_CHECKS.map((c) => `
                <label class="ps-check"><input type="checkbox" data-req-parking="${esc(c)}" ${(req.parking_checks || []).includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}
            </div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.5 Lifestyle &amp; Family Details</h3>
          <div class="ps-section-body">
            <div class="ps-grid ps-grid-4">
              <div class="ps-field"><label>Family Members</label><input data-req-field="family_members" type="number" min="0" value="${esc(req.family_members)}"></div>
              <div class="ps-field"><label>Adults</label><input data-req-field="adults" type="number" min="0" value="${esc(req.adults)}"></div>
              <div class="ps-field"><label>Children</label><input data-req-field="children" type="number" min="0" value="${esc(req.children)}"></div>
              <div class="ps-field"><label>Elderly Members</label><input data-req-field="elderly_members" type="number" min="0" value="${esc(req.elderly_members)}"></div>
            </div>
            <div class="ps-features rq-check-grid">
              ${model.LIFESTYLE_CHECKS.map((c) => `
                <label class="ps-check"><input type="checkbox" data-req-lifestyle="${esc(c)}" ${(req.lifestyle_checks || []).includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}
            </div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.6 Home Features &amp; Systems</h3>
          <div class="ps-section-body ps-features rq-check-grid">
            ${model.HOME_FEATURES.map((f) => `
              <label class="ps-check"><input type="checkbox" data-req-feature="${esc(f)}" ${(req.home_features || []).includes(f) ? 'checked' : ''}> ${esc(f)}</label>`).join('')}
            <div class="ps-field rq-full"><label>Other Features</label>
              <input data-req-field="other_features" type="text" value="${esc(req.other_features)}" placeholder="Any other features..."></div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.7 Architectural &amp; Interior Preferences</h3>
          <div class="ps-section-body ps-grid ps-grid-2">
            ${model.STYLE_FIELDS.map((f) => `
              <div class="ps-field"><label>${esc(f.label)}</label>
                <select data-req-field="${f.key}" data-ps-searchable>${selectOpts(f.options, req[f.key])}</select></div>`).join('')}
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.8 Vastu &amp; Orientation</h3>
          <div class="ps-section-body ps-grid ps-grid-2">
            <div class="ps-field"><label>Follow Vastu?</label>
              <select data-req-field="follow_vastu" data-ps-searchable>${selectOpts(['Yes', 'No', 'Partly'], req.follow_vastu)}</select></div>
            <div class="ps-field"><label>Main Entrance Direction</label>
              <select data-req-field="entrance_direction" data-ps-searchable>${selectOpts(model.VASTU_DIRECTIONS, req.entrance_direction)}</select></div>
            <div class="ps-field"><label>Pooja Room Direction</label>
              <select data-req-field="pooja_direction" data-ps-searchable>${selectOpts(model.VASTU_DIRECTIONS, req.pooja_direction)}</select></div>
            <div class="ps-field"><label>Kitchen Direction</label>
              <select data-req-field="kitchen_direction" data-ps-searchable>${selectOpts(model.VASTU_DIRECTIONS, req.kitchen_direction)}</select></div>
            <div class="ps-field rq-full"><label>Additional Vastu Requirements</label>
              <textarea data-req-field="vastu_notes" rows="3" placeholder="e.g. avoid staircase in North, keep open space in East...">${esc(req.vastu_notes)}</textarea></div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.9 Budget &amp; Quality Preference</h3>
          <div class="ps-section-body">
            <div class="rq-info-box">Total project budget is taken from Project Setup (${budgetFmt}). You can allocate below.</div>
            <div class="ps-grid ps-grid-2">
              <div class="ps-field"><label>Construction Budget (\u20B9)</label><input data-req-field="budget_construction" type="number" min="0" value="${esc(req.budget_construction)}"></div>
              <div class="ps-field"><label>Interior Budget (\u20B9)</label><input data-req-field="budget_interior" type="number" min="0" value="${esc(req.budget_interior)}"></div>
              <div class="ps-field"><label>Landscape Budget (\u20B9)</label><input data-req-field="budget_landscape" type="number" min="0" value="${esc(req.budget_landscape)}"></div>
              <div class="ps-field"><label>Contingency (%)</label><input data-req-field="contingency_pct" type="number" min="0" max="50" value="${esc(req.contingency_pct)}"></div>
              <div class="ps-field"><label>Quality Level <span class="req">*</span></label>
                <select data-req-field="quality" data-ps-searchable>${selectOpts(model.QUALITY_LEVELS, req.quality)}</select>${fieldErr(errors, 'quality')}</div>
              <div class="ps-field"><label>Material Preference</label>
                <select data-req-field="material_preference" data-ps-searchable>${selectOpts(model.MATERIAL_PREFS, req.material_preference)}</select></div>
            </div>
            ${b.exceeds ? `<p class="rq-budget-inline-warn">Allocation total \u20B9${b.total.toLocaleString('en-IN')} exceeds project budget.</p>` : ''}
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.10 Special Requirements</h3>
          <div class="ps-section-body">
            <div class="ps-field"><label>Tell us about any specific requirements, preferences or restrictions...</label>
              <textarea data-req-field="special_requirements" rows="4" maxlength="500">${esc(req.special_requirements)}</textarea></div>
            <div class="ps-field"><label>Things to Avoid (Optional)</label>
              <textarea data-req-field="things_to_avoid" rows="3" maxlength="300" placeholder="e.g. no basement, no dark colors, avoid compact spaces...">${esc(req.things_to_avoid)}</textarea></div>
          </div>
        </section>

        <section class="ps-section rq-section">
          <h3 class="ps-section-title">3.11 Reference Images &amp; Documents</h3>
          <div class="ps-section-body">
            <div class="ps-upload-zone" id="req-upload-zone">
              <p><strong>Drag &amp; drop files here or click to upload</strong></p>
              <p class="ps-upload-hint">JPG, PNG, PDF, DWG \u2014 max 10 MB each</p>
              <input type="file" id="req-file-input" multiple accept=".jpg,.jpeg,.png,.pdf,.dwg" hidden>
            </div>
            <div class="ps-doc-list" id="req-ref-list">${refs || '<p class="ps-doc-empty">No reference files yet.</p>'}</div>
          </div>
        </section>
        <input type="hidden" data-req-field="budget_exceeded_acknowledged" value="${req.budget_exceeded_acknowledged ? '1' : ''}">
        <input type="hidden" data-req-field="total_project_budget" value="${esc(req.total_project_budget || setup.estimated_budget || '')}">
      </form>`;
  }

  function readFormState(formEl, prev) {
    const state = { ...prev, custom_rooms: prev.custom_rooms || [] };
    formEl.querySelectorAll('input[data-req-field], textarea[data-req-field], select[data-req-field]').forEach((el) => {
      if (el.type === 'hidden' && el.dataset.reqField === 'budget_exceeded_acknowledged') {
        state.budget_exceeded_acknowledged = el.value === '1';
      } else {
        state[el.dataset.reqField] = el.value;
      }
    });
    formEl.querySelectorAll('[data-rq-counter]').forEach((box) => {
      const key = box.dataset.rqCounter;
      const hidden = qtyHiddenInput(box, key);
      if (hidden) state[key] = hidden.value;
    });
    const selType = formEl.querySelector('.rq-type-card.selected');
    if (selType) state.project_type = selType.dataset.reqType;
    state.home_features = [...formEl.querySelectorAll('[data-req-feature]:checked')].map((c) => c.dataset.reqFeature);
    state.lifestyle_checks = [...formEl.querySelectorAll('[data-req-lifestyle]:checked')].map((c) => c.dataset.reqLifestyle);
    state.parking_checks = [...formEl.querySelectorAll('[data-req-parking]:checked')].map((c) => c.dataset.reqParking);
    state.reference_files = prev.reference_files || [];
    return state;
  }

  function syncCounters(container, state, onChange) {
    container.querySelectorAll('[data-rq-counter]').forEach((box) => {
      const key = box.dataset.rqCounter;
      const valEl = box.querySelector('[data-rq-val]');
      const hidden = qtyHiddenInput(box, key);
      const set = (n) => {
        const v = Math.max(0, n);
        if (valEl) valEl.textContent = String(v);
        if (hidden) hidden.value = String(v);
        state[key] = String(v);
        onChange?.(state);
      };
      box.querySelector('[data-rq-dec]')?.addEventListener('click', () => set((parseInt(hidden?.value, 10) || 0) - 1));
      box.querySelector('[data-rq-inc]')?.addEventListener('click', () => set((parseInt(hidden?.value, 10) || 0) + 1));
    });
  }

  function bindForm(container, state, callbacks = {}) {
    const form = container.querySelector('#requirements-form');
    if (!form) return;
    const onChange = typeof callbacks === 'function' ? callbacks : callbacks.onChange;

    if (root.SearchableSelect) root.SearchableSelect.enhanceAll(container);

    syncCounters(container, state, onChange);

    form.querySelectorAll('.rq-type-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.rq-type-card').forEach((b) => {
          b.classList.remove('selected');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        state.project_type = btn.dataset.reqType;
        onChange?.(state);
      });
    });

    const addRoomsBtn = container.querySelector('#rq-add-rooms');
    const customPanel = container.querySelector('#rq-custom-panel');
    addRoomsBtn?.addEventListener('click', () => {
      if (!customPanel) return;
      const open = customPanel.hidden;
      customPanel.hidden = !open;
      addRoomsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    const showAreaHelp = () => {
      const area=M().areaValidation(state);
      const popup=document.createElement('dialog');
      popup.setAttribute('aria-label','How to fix room calculation warnings');
      popup.style.cssText='background:#171717;color:#eee;border:1px solid #ffd400;border-radius:14px;padding:24px;width:min(600px,90vw);max-height:80vh;overflow:auto;line-height:1.6';
      popup.innerHTML='<h2 style="color:#ffd400">How to fix this warning</h2><p>The room calculator currently reads <strong>'+esc(area.plot)+' sq.ft plot area</strong> and <strong>'+esc(area.built)+' sq.ft built-up area</strong>.</p><ol><li><strong>Step 2 — Land &amp; Site:</strong> use the Previous button to go back. Enter <strong>Plot Length (ft)</strong> and <strong>Plot Width (ft)</strong>. Both must be greater than zero. For a 34 × 70 ft plot, enter 34 and 70. The summary card alone does not supply these fields.</li><li>In <strong>2.3 Setbacks &amp; Buildable Area</strong>, check <strong>Front, Rear, Left and Right Setback (ft)</strong>. Enter your actual required setbacks; they must leave buildable space.</li><li>Return to <strong>Step 3 → 3.1 Basic Requirements</strong>. Set <strong>Built-up Area (sq.ft)</strong> to the total planned floor area across all floors, and check the floor selection. This is an area, not a plot side length. It must fit within the buildable footprint × floor count.</li><li>If the area is too small, review room quantities in <strong>3.2 Rooms &amp; Layout</strong>. Reduce quantities or increase the planned built-up area only if it fits your plot and floors. The calculator also reserves space for bathrooms, guest rooms, walls, stairs and circulation.</li><li>Return to <strong>3.3 Room Details</strong> and click <strong>Auto calculate room sizes</strong> again.</li></ol><button type="button" style="background:#ffd400;color:#111;border:0;border-radius:8px;padding:12px 20px;font-weight:700">Got it</button>';
      document.body.appendChild(popup);
      popup.querySelector('button').addEventListener('click',()=>popup.close());
      popup.addEventListener('close',()=>popup.remove());popup.showModal();
    };
    container.querySelector('#rq-area-help')?.addEventListener('click',showAreaHelp);
    const showArea = () => {
      const area = M().areaValidation(state);
      const summary = container.querySelector('#rq-area-summary');
      const help=container.querySelector('#rq-area-help');if(help)help.hidden=!Object.keys(area.errors).length;
      if (summary) {
        summary.textContent = `Plot: ${area.plot} sq.ft · Buildable footprint: ${area.footprint} sq.ft · ${area.floors} floor(s) · Specified rooms: ${area.roomArea} sq.ft · Remaining: ${area.remaining} sq.ft. ${area.errors.room_area || area.errors.built_up_area || area.errors.plot_size || ''}`;
        summary.className = Object.keys(area.errors).length ? 'ps-field-error' : 'rq-hint';
      }
      M().ROOM_SIZE_FIELDS.forEach(({key}) => {
        const input = form.querySelector(`[data-req-field="${key}"]`);
        if (input) { if (area.footprint) input.max = area.footprint; input.setCustomValidity(area.errors[key] || ''); input.setAttribute('aria-invalid', String(Boolean(area.errors[key]))); }
        const error = form.querySelector(`[data-room-error="${key}"]`);
        if (error) error.textContent = area.errors[key] || '';
      });
    };
    const sync = () => { Object.assign(state, readFormState(form, state)); showArea(); onChange?.(state); };
    showArea();
    container.querySelector('#rq-auto-calculate')?.addEventListener('click', () => {
      sync();
      const message=container.querySelector('#rq-auto-result');
      try {
        const result=M().autoRoomSizes(state);
        Object.assign(state,result.sizes);
        Object.entries(result.sizes).forEach(([key,value])=>{const input=form.querySelector('[data-req-field="'+key+'"]');if(input)input.value=value;});
        sync();
        message.className='rq-hint';
        message.textContent='Suggested sizes applied. Reserved 25% for walls, stairs and circulation, plus bathroom and guest-room allowances. Custom rooms were preserved. Review these suggestions with your designer.';
      } catch(e) { message.className='ps-field-error';message.textContent=e.message; container.querySelector('#rq-area-help').hidden=false;showAreaHelp(); }
    });
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);

    container.querySelector('#rq-custom-add')?.addEventListener('click', () => {
      const name = container.querySelector('#rq-custom-name')?.value?.trim();
      const qty = container.querySelector('#rq-custom-qty')?.value || '1';
      if (!name) return;
      state.custom_rooms = state.custom_rooms || [];
      state.custom_rooms.push({ name, qty });
      container.querySelector('#rq-custom-name').value = '';
      onChange?.(state);
      const list = container.querySelector('#rq-custom-list');
      if (list) list.innerHTML = state.custom_rooms.map((r, i) => `
        <div class="rq-custom-row"><span>${esc(r.name)} (${esc(r.qty)})</span>
        <button type="button" class="ps-doc-remove" data-req-remove-custom="${i}">\u00D7</button></div>`).join('');
    });

    container.querySelectorAll('[data-req-remove-custom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.custom_rooms.splice(parseInt(btn.dataset.reqRemoveCustom, 10), 1);
        onChange?.(state);
        btn.closest('.rq-custom-row')?.remove();
      });
    });

    container.querySelector('#rq-budget-approve')?.addEventListener('click', () => {
      state.budget_exceeded_acknowledged = true;
      const h = form.querySelector('[data-req-field="budget_exceeded_acknowledged"]');
      if (h) h.value = '1';
      container.querySelector('#rq-budget-warn')?.remove();
      onChange?.(state);
    });

    container.querySelector('#rq-budget-adjust')?.addEventListener('click', () => {
      form.querySelector('[data-req-field="budget_construction"]')?.focus();
      form.querySelector('[data-req-field="budget_construction"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const zone = container.querySelector('#req-upload-zone');
    const fileInput = container.querySelector('#req-file-input');
    if (zone && fileInput) {
      zone.addEventListener('click', () => fileInput.click());
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragover'); callbacks.onFiles?.(e.dataTransfer.files); });
      fileInput.addEventListener('change', () => { callbacks.onFiles?.(fileInput.files); fileInput.value = ''; });
    }

    container.querySelectorAll('[data-req-remove-ref]').forEach((btn) => {
      btn.addEventListener('click', () => callbacks.onRemoveRef?.(parseInt(btn.dataset.reqRemoveRef, 10)));
    });
  }

  function defaults(setup, land) {
    return M().defaults(setup, land);
  }

  function validate(req, opts) {
    return M().validate(req, opts);
  }

  function toIntentAnswers(req) {
    return M().toIntentAnswers(req);
  }

  root.RequirementsStep = { defaults, validate, renderForm, bindForm, readFormState, toIntentAnswers };
})(typeof window !== 'undefined' ? window : global);
