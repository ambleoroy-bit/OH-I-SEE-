// OH I SEE - Project Setup form renderer (Step 1.1)
(function (root) {
  'use strict';
  const M = () => root.ProjectSetupModel;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  const INR = '\u20B9';

  function docIconClass(mime) {
    if (mime?.includes('pdf')) return 'ps-doc-icon-pdf';
    if (mime?.includes('image')) return 'ps-doc-icon-img';
    return 'ps-doc-icon-file';
  }

  function docIconLabel(mime) {
    if (mime?.includes('pdf')) return 'PDF';
    if (mime?.includes('image')) return 'IMG';
    return 'FILE';
  }

  function docRowHtml(doc, i) {
    const ready = doc.status === 'uploaded' || doc.local === true;
    return `<div class="ps-doc-row" data-doc-index="${i}">
      <span class="ps-doc-icon ${docIconClass(doc.mime_type)}">${docIconLabel(doc.mime_type)}</span>
      <span class="ps-doc-name">${esc(doc.file_name)}</span>
      <span class="ps-doc-size">${formatBytes(doc.file_size)}</span>
      <span class="ps-doc-status ${ready ? 'ok' : 'pending'}">${ready ? 'Ready' : 'Pending'}</span>
      <button type="button" class="ps-doc-remove" data-remove-doc="${i}" title="Remove" aria-label="Remove file">\u00D7</button>
    </div>`;
  }

  function renderDocListHtml(state) {
    const docs = state.documents || [];
    if (!docs.length) return '<p class="ps-doc-empty">No documents uploaded yet.</p>';
    return docs.map((doc, i) => docRowHtml(doc, i)).join('');
  }
  let mapInstance = null;
  let mapMarker = null;
  function fieldError(errors, key) {
    if (!errors?.[key]) return '';
    return `<div class="ps-field-error" role="alert">${esc(errors[key])}</div>`;
  }
  function renderSection(title, content) {
    return `<section class="ps-section"><h3 class="ps-section-title">${esc(title)}</h3><div class="ps-section-body">${content}</div></section>`;
  }
  function destroyMap() {
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
      mapMarker = null;
    }
  }
  function fixLeafletIcons() {
    if (typeof L === 'undefined' || !L.Icon?.Default?.prototype?._getIconUrl) return;
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }
  function renderForm(state, errors = {}) {
    const model = M();
    const cities = model.INDIAN_STATES[state.state] || [];
    const cityOptions = cities.length
      ? cities.map((c) => `<option value="${esc(c)}" ${state.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')
      : `<option value="${esc(state.city)}">${esc(state.city || 'Select state first')}</option>`;
    const stateOptions = Object.keys(model.INDIAN_STATES).map(
      (s) => `<option value="${esc(s)}" ${state.state === s ? 'selected' : ''}>${esc(s)}</option>`
    ).join('');
    const typeOptions = model.PROJECT_TYPES.map(
      (t) => `<option value="${esc(t)}" ${state.project_type === t ? 'selected' : ''}>${esc(t)}</option>`
    ).join('');
    const constructionOptions = model.CONSTRUCTION_TYPES.map(
      (t) => `<option value="${esc(t)}" ${state.construction_type === t ? 'selected' : ''}>${esc(t)}</option>`
    ).join('');
    const ownershipOptions = model.OWNERSHIP_STATUS.map(
      (t) => `<option value="${esc(t)}" ${state.ownership_status === t ? 'selected' : ''}>${esc(t)}</option>`
    ).join('');
    const urgencyOptions = model.URGENCY_OPTIONS.map(
      (t) => `<option value="${esc(t)}" ${state.urgency === t ? 'selected' : ''}>${esc(t)}</option>`
    ).join('');
    const floorOptions = model.FLOOR_OPTIONS.map(
      (f) => `<option value="${esc(f)}" ${state.floors === f ? 'selected' : ''}>${esc(f)}</option>`
    ).join('');
    const facingOptions = model.FACING_OPTIONS.map(
      (f) => `<option value="${esc(f)}" ${state.facing_direction === f ? 'selected' : ''}>${esc(f)}</option>`
    ).join('');
    const countryOptions = model.COUNTRY_CODES.map(
      (c) => `<option value="${esc(c.code)}" ${state.phone_country === c.code ? 'selected' : ''}>${esc(c.label)}</option>`
    ).join('');
    const features = model.FEATURE_KEYS.map(({ key, label }) => {
      const on = !!state.features?.[key];
      return `<label class="ps-check"><input type="checkbox" data-ps-feature="${key}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
    }).join('');
    const descLen = (state.description || '').length;
    const docList = renderDocListHtml(state);
    const lat = state.latitude ? parseFloat(state.latitude) : null;
    const lng = state.longitude ? parseFloat(state.longitude) : null;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    return `
      <form id="project-setup-form" class="ps-form" novalidate>
        ${renderSection('Basic Information', `
          <div class="ps-grid ps-grid-2">
            <div class="ps-field">
              <label for="ps-project_name">Project Name <span class="req">*</span></label>
              <input id="ps-project_name" name="project_name" data-ps-field="project_name" type="text" placeholder="Enter project name" value="${esc(state.project_name)}" class="${errors.project_name ? 'invalid' : ''}">
              ${fieldError(errors, 'project_name')}
            </div>
            <div class="ps-field">
              <label for="ps-project_type">Project Type <span class="req">*</span></label>
              <select id="ps-project_type" name="project_type" data-ps-field="project_type" data-ps-searchable>${typeOptions}</select>
              ${fieldError(errors, 'project_type')}
            </div>
          </div>
          <div class="ps-grid ps-grid-2">
            <div class="ps-field">
              <label for="ps-construction_type">Construction Type <span class="req">*</span></label>
              <select id="ps-construction_type" data-ps-field="construction_type" data-ps-searchable>${constructionOptions}</select>
              ${fieldError(errors, 'construction_type')}
            </div>
          </div>
          <div class="ps-field">
            <label for="ps-description">Project Description <span class="req">*</span></label>
            <textarea id="ps-description" name="description" data-ps-field="description" rows="4" maxlength="500" placeholder="Describe the construction project">${esc(state.description)}</textarea>
            <div class="ps-char-count"><span id="ps-desc-count">${descLen}</span>/500</div>
            ${fieldError(errors, 'description')}
          </div>
        `)}
        ${renderSection('Ownership Details', `
          <div class="ps-grid ps-grid-2">
            <div class="ps-field">
              <label for="ps-owner_name">Owner / Client Name <span class="req">*</span></label>
              <input id="ps-owner_name" data-ps-field="owner_name" type="text" value="${esc(state.owner_name)}">
              ${fieldError(errors, 'owner_name')}
            </div>
            <div class="ps-field">
              <label for="ps-owner_email">Email Address <span class="req">*</span></label>
              <input id="ps-owner_email" data-ps-field="owner_email" type="email" value="${esc(state.owner_email)}">
              ${fieldError(errors, 'owner_email')}
            </div>
          </div>
          <div class="ps-grid ps-grid-2">
            <div class="ps-field ps-phone-field">
              <label for="ps-owner_phone">Phone Number <span class="req">*</span></label>
              <div class="ps-phone-row">
                <select id="ps-phone_country" data-ps-field="phone_country" data-ps-searchable>${countryOptions}</select>
                <input id="ps-owner_phone" data-ps-field="owner_phone" type="tel" placeholder="10-digit mobile" value="${esc(state.owner_phone)}">
              </div>
              ${fieldError(errors, 'owner_phone')}
            </div>
            <div class="ps-field">
              <label for="ps-owner_phone_alt">Alternate Phone</label>
              <input id="ps-owner_phone_alt" data-ps-field="owner_phone_alt" type="tel" value="${esc(state.owner_phone_alt)}">
            </div>
          </div>
          <div class="ps-grid ps-grid-2">
            <div class="ps-field">
              <label for="ps-ownership_status">Ownership Status <span class="req">*</span></label>
              <select id="ps-ownership_status" data-ps-field="ownership_status" data-ps-searchable>${ownershipOptions}</select>
              ${fieldError(errors, 'ownership_status')}
            </div>
            <div class="ps-field">
              <label for="ps-owner_address">Correspondence Address <span class="req">*</span></label>
              <textarea id="ps-owner_address" data-ps-field="owner_address" rows="3" placeholder="Door no., street, area, city, state, pincode">${esc(state.owner_address)}</textarea>
              ${fieldError(errors, 'owner_address')}
            </div>
          </div>
        `)}
        ${renderSection('Location Details', `
          <div class="ps-field">
            <label for="ps-site_address">Site / Plot Address <span class="req">*</span></label>
            <input id="ps-site_address" data-ps-field="site_address" type="text" value="${esc(state.site_address)}">
            ${fieldError(errors, 'site_address')}
          </div>
          <div class="ps-grid ps-grid-3">
            <div class="ps-field">
              <label for="ps-state">State <span class="req">*</span></label>
              <select id="ps-state" data-ps-field="state" data-ps-searchable>${stateOptions}</select>
              ${fieldError(errors, 'state')}
            </div>
            <div class="ps-field">
              <label for="ps-city">City <span class="req">*</span></label>
              <select id="ps-city" data-ps-field="city" data-ps-searchable>${cityOptions}</select>
              ${fieldError(errors, 'city')}
            </div>
            <div class="ps-field">
              <label for="ps-district">District</label>
              <input id="ps-district" data-ps-field="district" type="text" value="${esc(state.district)}">
            </div>
            <div class="ps-field">
              <label for="ps-pincode">Pincode <span class="req">*</span></label>
              <input id="ps-pincode" data-ps-field="pincode" type="text" maxlength="6" value="${esc(state.pincode)}">
              ${fieldError(errors, 'pincode')}
            </div>
          </div>
          <div class="ps-grid ps-grid-3">
            <div class="ps-field">
              <label for="ps-latitude">Latitude</label>
              <input id="ps-latitude" data-ps-field="latitude" type="number" step="any" value="${esc(state.latitude)}" readonly>
            </div>
            <div class="ps-field">
              <label for="ps-longitude">Longitude</label>
              <input id="ps-longitude" data-ps-field="longitude" type="number" step="any" value="${esc(state.longitude)}" readonly>
            </div>
            <div class="ps-field">
              <label for="ps-survey_number">Survey Number</label>
              <input id="ps-survey_number" data-ps-field="survey_number" type="text" value="${esc(state.survey_number)}">
            </div>
            <div class="ps-field">
              <label for="ps-sub_division_number">Sub-Division Number</label>
              <input id="ps-sub_division_number" data-ps-field="sub_division_number" type="text" value="${esc(state.sub_division_number)}">
            </div>
          </div>
          <div class="ps-map-block">
            <p class="ps-map-hint">Click the map or drag the pin to set site coordinates.</p>
            <div id="ps-map-canvas" class="ps-map-canvas" role="application" aria-label="Site location map"></div>
            <div class="ps-map-actions">
              <a class="pw-btn" id="ps-view-map-link" href="${hasCoords ? `https://www.google.com/maps?q=${lat},${lng}` : '#'}" target="_blank" rel="noopener" ${hasCoords ? '' : 'hidden'}>View on Google Maps</a>
            </div>
          </div>
        `)}
        ${renderSection('Project Category & Features', `
          <div class="ps-grid ps-grid-3">
            <div class="ps-field">
              <label for="ps-floors">Number of Floors <span class="req">*</span></label>
              <select id="ps-floors" data-ps-field="floors" data-ps-searchable>${floorOptions}</select>
              ${fieldError(errors, 'floors')}
            </div>
            <div class="ps-field">
              <label for="ps-built_up_area">Total Built-up Area (sq.ft) <span class="req">*</span></label>
              <input id="ps-built_up_area" data-ps-field="built_up_area" type="number" min="1" value="${esc(state.built_up_area)}">
              ${fieldError(errors, 'built_up_area')}
            </div>
            <div class="ps-field">
              <label for="ps-facing">Facing Direction</label>
              <select id="ps-facing" data-ps-field="facing_direction" data-ps-searchable>${facingOptions}</select>
            </div>
          </div>
          <div class="ps-field">
            <label class="ps-label-block">Project Features</label>
            <div class="ps-features">${features}</div>
          </div>
          <div class="ps-field">
            <label for="ps-additional_notes">Additional Notes</label>
            <textarea id="ps-additional_notes" data-ps-field="additional_notes" rows="3" placeholder="Add additional project requirements">${esc(state.additional_notes)}</textarea>
          </div>
        `)}
        ${renderSection('Project Timeline', `
          <div class="ps-grid ps-grid-3">
            <div class="ps-field">
              <label for="ps-start_date">Expected Start Date <span class="req">*</span></label>
              <input id="ps-start_date" data-ps-field="start_date" type="date" value="${esc(state.start_date)}">
              ${fieldError(errors, 'start_date')}
            </div>
            <div class="ps-field">
              <label for="ps-target_completion_date">Target Completion Date <span class="req">*</span></label>
              <input id="ps-target_completion_date" data-ps-field="target_completion_date" type="date" value="${esc(state.target_completion_date)}">
              ${fieldError(errors, 'target_completion_date')}
            </div>
            <div class="ps-field">
              <label for="ps-construction_duration">Est. Construction Duration</label>
              <input id="ps-construction_duration" data-ps-field="construction_duration" type="text" placeholder="e.g. 12 months" value="${esc(state.construction_duration)}">
            </div>
          </div>
          <div class="ps-grid ps-grid-3">
            <div class="ps-field">
              <label for="ps-preferred_start_month">Preferred Start Month</label>
              <input id="ps-preferred_start_month" data-ps-field="preferred_start_month" type="month" value="${esc(state.preferred_start_month)}">
            </div>
            <div class="ps-field">
              <label for="ps-urgency">Urgency</label>
              <select id="ps-urgency" data-ps-field="urgency" data-ps-searchable>${urgencyOptions}</select>
            </div>
            <div class="ps-field">
              <label for="ps-estimated_budget">Estimated Budget (${INR})</label>
              <input id="ps-estimated_budget" data-ps-field="estimated_budget" type="text" placeholder="e.g. 50,00,000" value="${esc(state.estimated_budget)}">
              ${fieldError(errors, 'estimated_budget')}
            </div>
          </div>
        `)}
        ${renderSection('Project Documents (Basic)', `
          <p class="ps-doc-sub">Upload key documents related to the project. <strong>Required:</strong> Land ownership document. Others are optional.</p>
          <div class="ps-upload-zone" id="ps-upload-zone">
            <div class="ps-upload-icon" aria-hidden="true"></div>
            <p><strong>Upload Files</strong></p>
            <p>Drag &amp; drop files here or click to upload</p>
            <p class="ps-upload-hint">PDF \u00B7 JPG \u00B7 PNG \u00B7 DWG \u00B7 DXF \u2014 Maximum 25 MB per file</p>
            <input type="file" id="ps-file-input" multiple accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf" hidden>
          </div>
          <div class="ps-doc-type-row">
            <label>Document type</label>
            <select id="ps-doc-type" data-ps-searchable>
              ${model.DOCUMENT_TYPES.map((d) => `<option value="${d.type}">${esc(d.label)}${d.required ? ' (Required)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="ps-doc-list" id="ps-doc-list">${docList}</div>
          <div id="ps-doc-errors">${fieldError(errors, 'documents')}</div>
        `)}
      </form>`;
  }
  function formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function readFormState(formEl, prev = {}) {
    const state = { ...prev, features: { ...(prev.features || {}) } };
    formEl.querySelectorAll('[data-ps-field]').forEach((el) => {
      const key = el.dataset.psField;
      if (el.type === 'checkbox') state.features[key] = el.checked;
      else state[key] = el.value;
    });
    formEl.querySelectorAll('[data-ps-feature]').forEach((el) => {
      state.features[el.dataset.psFeature] = el.checked;
    });
    state.documents = prev.documents || [];
    return state;
  }
  function updateMapLink(container, lat, lng) {
    const link = container.querySelector('#ps-view-map-link');
    if (!link) return;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      link.href = `https://www.google.com/maps?q=${lat},${lng}`;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  }
  function recenterMap(state) {
    if (!mapInstance || !mapMarker) return;
    const [lat, lng] = M().getCityCenter(state.city, state.state);
    mapInstance.setView([lat, lng], 13);
    mapMarker.setLatLng([lat, lng]);
  }
  function initMap(container, state, onPick) {
    destroyMap();
    const canvas = container.querySelector('#ps-map-canvas');
    if (!canvas || typeof L === 'undefined') return;
    fixLeafletIcons();
    const savedLat = parseFloat(state.latitude);
    const savedLng = parseFloat(state.longitude);
    const [defaultLat, defaultLng] = M().getCityCenter(state.city, state.state);
    const lat = Number.isFinite(savedLat) ? savedLat : defaultLat;
    const lng = Number.isFinite(savedLng) ? savedLng : defaultLng;
    mapInstance = L.map(canvas, { scrollWheelZoom: true }).setView([lat, lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'Â© OpenStreetMap contributors',
    }).addTo(mapInstance);
    mapMarker = L.marker([lat, lng], { draggable: true }).addTo(mapInstance);
    const setCoords = (la, ln) => {
      state.latitude = String(Math.round(la * 1e6) / 1e6);
      state.longitude = String(Math.round(ln * 1e6) / 1e6);
      const latEl = container.querySelector('#ps-latitude');
      const lngEl = container.querySelector('#ps-longitude');
      if (latEl) latEl.value = state.latitude;
      if (lngEl) lngEl.value = state.longitude;
      updateMapLink(container, la, ln);
      onPick(la, ln);
    };
    mapInstance.on('click', (e) => {
      mapMarker.setLatLng(e.latlng);
      setCoords(e.latlng.lat, e.latlng.lng);
    });
    mapMarker.on('dragend', () => {
      const p = mapMarker.getLatLng();
      setCoords(p.lat, p.lng);
    });
    requestAnimationFrame(() => mapInstance.invalidateSize());
    setTimeout(() => mapInstance.invalidateSize(), 250);
  }
  function bindForm(container, state, callbacks) {
    const form = container.querySelector('#project-setup-form');
    if (!form) return;
    if (root.SearchableSelect) root.SearchableSelect.enhanceAll(container);
    const sync = () => {
      const next = readFormState(form, state);
      Object.assign(state, next);
      callbacks.onChange?.(state);
    };
    form.addEventListener('input', (e) => {
      if (e.target.id === 'ps-description') {
        const c = document.getElementById('ps-desc-count');
        if (c) c.textContent = String(e.target.value.length);
      }
      if (e.target.id === 'ps-estimated_budget') {
        const raw = e.target.value.replace(/[^\d]/g, '');
        if (raw) e.target.value = M().formatINR(raw);
      }
      sync();
    });
    form.addEventListener('change', sync);
    form.querySelector('#ps-state')?.addEventListener('change', (e) => {
      state.state = e.target.value;
      const cities = M().INDIAN_STATES[state.state] || [];
      const citySel = form.querySelector('#ps-city');
      if (citySel) {
        citySel.innerHTML = cities.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        state.city = cities[0] || '';
        citySel.value = state.city;
        if (root.SearchableSelect) root.SearchableSelect.refresh(citySel);
        recenterMap(state);
        sync();
      }
    });
    form.querySelector('#ps-city')?.addEventListener('change', (e) => {
      state.city = e.target.value;
      recenterMap(state);
      sync();
    });
    initMap(container, state, (lat, lng) => {
      state.latitude = String(Math.round(lat * 1e6) / 1e6);
      state.longitude = String(Math.round(lng * 1e6) / 1e6);
      callbacks.onChange?.(state);
      callbacks.onMapPick?.(lat, lng);
    });
    const zone = container.querySelector('#ps-upload-zone');
    const fileInput = container.querySelector('#ps-file-input');
    if (zone && fileInput) {
      zone.addEventListener('click', () => fileInput.click());
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag');
        callbacks.onFiles?.(e.dataTransfer.files);
      });
      fileInput.addEventListener('change', () => {
        callbacks.onFiles?.(fileInput.files);
        fileInput.value = '';
      });
    }
    bindDocRemoveButtons(container, callbacks);
  }

  function bindDocRemoveButtons(container, callbacks) {
    container.querySelectorAll('[data-remove-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.removeDoc, 10);
        callbacks.onRemoveDoc?.(i);
      });
    });
  }

  function updateDocList(container, state, errors = {}, callbacks = {}) {
    const list = container.querySelector('#ps-doc-list');
    if (!list) return;
    list.innerHTML = renderDocListHtml(state);
    const errWrap = container.querySelector('#ps-doc-errors');
    if (errWrap) errWrap.innerHTML = fieldError(errors, 'documents');
    bindDocRemoveButtons(container, callbacks);
  }

  root.ProjectSetupForm = {
    renderForm, bindForm, readFormState, formatBytes, destroyMap,
    updateDocList, renderDocListHtml,
  };
})(typeof window !== 'undefined' ? window : global);
