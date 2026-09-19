// OH I SEE — Land & Site form (Step 2)
(function (root) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  const M = () => root.LandSiteModel;

  function fieldErr(errors, key) {
    return errors?.[key] ? `<div class="ps-field-error">${esc(errors[key])}</div>` : '';
  }

  function opts(list, selected, asValueLabel = false) {
    return list.map((item) => {
      const v = asValueLabel ? item : (item.value || item);
      const l = asValueLabel ? item : (item.label || item);
      return `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
  }

  function updateCalcDisplays(state) {
    const area = M().calcArea(state);
    const b = M().calcBuildable(state);
    const areaEl = document.getElementById('ls-area-display');
    const blEl = document.getElementById('ls-buildable-length');
    const bwEl = document.getElementById('ls-buildable-width');
    const baEl = document.getElementById('ls-buildable-area');
    const paEl = document.getElementById('ls-plot-area-calc');
    if (areaEl) areaEl.value = area ? area.toLocaleString('en-IN') : '\u2014';
    if (blEl) blEl.value = b.buildable_length ?? '\u2014';
    if (bwEl) bwEl.value = b.buildable_width ?? '\u2014';
    if (baEl) baEl.value = b.buildable_area ? b.buildable_area.toLocaleString('en-IN') : '\u2014';
    if (paEl) paEl.value = b.plot_area ? b.plot_area.toLocaleString('en-IN') : '\u2014';
  }

  function renderForm(state, errors = {}) {
    const model = M();
    const b = model.calcBuildable(state);
    const docList = (state.documents || []).map((doc, i) => `
      <div class="ps-doc-row" data-doc-index="${i}">
        <span class="ps-doc-icon ps-doc-icon-pdf">DOC</span>
        <span class="ps-doc-name">${esc(doc.file_name)}</span>
        <span class="ps-doc-size">${doc.file_size ? Math.round(doc.file_size / 1024) + ' KB' : ''}</span>
        <button type="button" class="ps-doc-remove" data-ls-remove-doc="${i}">\u00D7</button>
      </div>`).join('');

    return `
      <form id="land-site-form" class="ps-form" novalidate>
        <section class="ps-section">
          <h3 class="ps-section-title">2.1 Plot Dimensions</h3>
          <div class="ps-section-body">
            <div class="ps-grid ps-grid-3">
              <div class="ps-field"><label>Plot Length (ft) <span class="req">*</span></label>
                <input data-ls-field="plot_length_ft" type="number" min="1" step="0.1" value="${esc(state.plot_length_ft)}">${fieldErr(errors, 'plot_length_ft')}</div>
              <div class="ps-field"><label>Plot Width (ft) <span class="req">*</span></label>
                <input data-ls-field="plot_width_ft" type="number" min="1" step="0.1" value="${esc(state.plot_width_ft)}">${fieldErr(errors, 'plot_width_ft')}</div>
              <div class="ps-field"><label>Plot Area (sq.ft)</label>
                <input id="ls-area-display" type="text" readonly class="ps-readonly" value="${b.plot_area ? b.plot_area.toLocaleString('en-IN') : '\u2014'}"></div>
            </div>
            <div class="ps-field"><label>Plot Shape <span class="req">*</span></label>
              <select data-ls-field="plot_shape" data-ps-searchable>${opts(model.PLOT_SHAPES, state.plot_shape)}</select>${fieldErr(errors, 'plot_shape')}</div>
          </div>
        </section>

        <section class="ps-section">
          <h3 class="ps-section-title">2.2 Road &amp; Access</h3>
          <div class="ps-section-body">
            <div class="ps-grid ps-grid-2">
              <div class="ps-field"><label>Road Facing Side <span class="req">*</span></label>
                <select data-ls-field="road_facing" data-ps-searchable>${opts(model.ROAD_FACING, state.road_facing, true)}</select>${fieldErr(errors, 'road_facing')}</div>
              <div class="ps-field"><label>Road Width (ft)</label>
                <input data-ls-field="road_width_ft" type="number" min="0" step="0.5" value="${esc(state.road_width_ft)}"></div>
            </div>
            <div class="ps-grid ps-grid-3">
              <div class="ps-field"><label>Access Road Type <span class="req">*</span></label>
                <select data-ls-field="access_road_type" data-ps-searchable>${opts(model.ACCESS_ROAD_TYPES, state.access_road_type, true)}</select>${fieldErr(errors, 'access_road_type')}</div>
              <div class="ps-field"><label>Number of Road Sides</label>
                <select data-ls-field="road_sides_count" data-ps-searchable>${opts(['1', '2', '3'], state.road_sides_count, true)}</select></div>
              <div class="ps-field"><label>Main Entrance Road</label>
                <input data-ls-field="main_entrance_road" type="text" value="${esc(state.main_entrance_road)}"></div>
            </div>
            <div class="ps-grid ps-grid-2">
              <div class="ps-field"><label class="ps-check" style="margin-top:28px">
                <input type="checkbox" data-ls-bool="is_corner_plot" ${state.is_corner_plot ? 'checked' : ''}> Corner plot</label></div>
              <div class="ps-field" id="ls-second-road" style="${state.is_corner_plot ? '' : 'display:none'}"><label>Second Road Facing</label>
                <select data-ls-field="second_road_facing" data-ps-searchable>${opts(model.ROAD_FACING, state.second_road_facing, true)}</select>${fieldErr(errors, 'second_road_facing')}</div>
            </div>
          </div>
        </section>

        <section class="ps-section">
          <h3 class="ps-section-title">2.3 Setbacks &amp; Buildable Area</h3>
          <div class="ps-section-body">
            <div class="ps-grid ps-grid-4">
              <div class="ps-field"><label>Front Setback (ft) <span class="req">*</span></label><input data-ls-field="setback_front_ft" type="number" min="0" value="${esc(state.setback_front_ft)}">${fieldErr(errors, 'setback_front_ft')}</div>
              <div class="ps-field"><label>Rear Setback (ft) <span class="req">*</span></label><input data-ls-field="setback_rear_ft" type="number" min="0" value="${esc(state.setback_rear_ft)}">${fieldErr(errors, 'setback_rear_ft')}</div>
              <div class="ps-field"><label>Left Setback (ft) <span class="req">*</span></label><input data-ls-field="setback_left_ft" type="number" min="0" value="${esc(state.setback_left_ft)}">${fieldErr(errors, 'setback_left_ft')}</div>
              <div class="ps-field"><label>Right Setback (ft) <span class="req">*</span></label><input data-ls-field="setback_right_ft" type="number" min="0" value="${esc(state.setback_right_ft)}">${fieldErr(errors, 'setback_right_ft')}</div>
            </div>
            <div class="ps-grid ps-grid-4 ps-calc-row">
              <div class="ps-field"><label>Plot Area (calculated)</label><input id="ls-plot-area-calc" type="text" readonly class="ps-readonly"></div>
              <div class="ps-field"><label>Buildable Length (ft)</label><input id="ls-buildable-length" type="text" readonly class="ps-readonly"></div>
              <div class="ps-field"><label>Buildable Width (ft)</label><input id="ls-buildable-width" type="text" readonly class="ps-readonly"></div>
              <div class="ps-field"><label>Maximum Buildable Area (sq.ft)</label><input id="ls-buildable-area" type="text" readonly class="ps-readonly"></div>
            </div>
            <p class="ps-next-hint">Calculated values update automatically from plot size minus setbacks.</p>
          </div>
        </section>

        <section class="ps-section">
          <h3 class="ps-section-title">2.4 Site Conditions</h3>
          <div class="ps-section-body">
            <div class="ps-grid ps-grid-2">
              <div class="ps-field"><label>Soil / Ground Type <span class="req">*</span></label><select data-ls-field="soil_type" data-ps-searchable>${opts(model.SOIL_TYPES, state.soil_type, true)}</select></div>
              <div class="ps-field"><label>Slope</label><select data-ls-field="slope" data-ps-searchable>${opts(model.SLOPE_OPTIONS, state.slope, true)}</select></div>
              <div class="ps-field"><label>Drainage Condition</label><select data-ls-field="drainage_condition" data-ps-searchable>${opts(model.DRAINAGE_OPTIONS, state.drainage_condition, true)}</select></div>
              <div class="ps-field"><label>Land Use / Zoning</label><select data-ls-field="land_use_zone" data-ps-searchable>${opts(model.LAND_USE, state.land_use_zone, true)}</select></div>
            </div>
            <div class="ps-grid ps-grid-2">
              <div class="ps-field"><label>Existing Structures</label><input data-ls-field="existing_structures" type="text" value="${esc(state.existing_structures)}"></div>
              <div class="ps-field"><label>Trees on Site</label><input data-ls-field="trees_on_site" type="text" value="${esc(state.trees_on_site)}"></div>
            </div>
            <div class="ps-grid ps-grid-4">
              <div class="ps-field"><label>Water</label><select data-ls-field="water_availability" data-ps-searchable>${opts(model.UTILITY_OPTIONS, state.water_availability, true)}</select></div>
              <div class="ps-field"><label>Electricity</label><select data-ls-field="electricity_availability" data-ps-searchable>${opts(model.UTILITY_OPTIONS, state.electricity_availability, true)}</select></div>
              <div class="ps-field"><label>Sewer</label><select data-ls-field="sewer_availability" data-ps-searchable>${opts(model.UTILITY_OPTIONS, state.sewer_availability, true)}</select></div>
              <div class="ps-field"><label>Gas</label><select data-ls-field="gas_availability" data-ps-searchable>${opts(model.UTILITY_OPTIONS, state.gas_availability, true)}</select></div>
            </div>
            <div class="ps-grid ps-grid-2">
              <div class="ps-field"><label>Flood Risk</label><select data-ls-field="flood_risk" data-ps-searchable>${opts(['Low', 'Medium', 'High', 'Unknown'], state.flood_risk, true)}</select></div>
              <div class="ps-field"><label>Site Access</label><input data-ls-field="site_access" type="text" value="${esc(state.site_access)}"></div>
            </div>
            <div class="ps-field"><label>Additional Site Notes</label><textarea data-ls-field="site_notes" rows="3">${esc(state.site_notes)}</textarea></div>
          </div>
        </section>

        <section class="ps-section">
          <h3 class="ps-section-title">2.5 Location &amp; Survey</h3>
          <div class="ps-section-body">
            <div class="ps-field"><label>Full Site Address</label><input data-ls-field="site_address" type="text" value="${esc(state.site_address)}"></div>
            <div class="ps-grid ps-grid-3">
              <div class="ps-field"><label>State</label><input data-ls-field="site_state" type="text" value="${esc(state.site_state)}"></div>
              <div class="ps-field"><label>City</label><input data-ls-field="site_city" type="text" value="${esc(state.site_city)}"></div>
              <div class="ps-field"><label>Pincode</label><input data-ls-field="site_pincode" type="text" value="${esc(state.site_pincode)}"></div>
            </div>
            <div class="ps-grid ps-grid-3">
              <div class="ps-field"><label>Survey Number</label><input data-ls-field="site_survey_number" type="text" value="${esc(state.site_survey_number)}"></div>
              <div class="ps-field"><label>Latitude</label><input data-ls-field="site_latitude" type="text" value="${esc(state.site_latitude)}"></div>
              <div class="ps-field"><label>Longitude</label><input data-ls-field="site_longitude" type="text" value="${esc(state.site_longitude)}"></div>
            </div>
          </div>
        </section>

        <section class="ps-section">
          <h3 class="ps-section-title">2.6 Land &amp; Site Documents</h3>
          <div class="ps-section-body">
            <div class="ps-upload-zone" id="ls-upload-zone">
              <p><strong>Upload land &amp; site documents</strong></p>
              <p class="ps-upload-hint">PDF, JPG, PNG, DWG, DXF \u2014 max 25 MB</p>
              <input type="file" id="ls-file-input" multiple accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf" hidden>
            </div>
            <div class="ps-doc-type-row"><label>Document type</label>
              <select id="ls-doc-type" data-ps-searchable>${model.LAND_DOCUMENT_TYPES.map((d) => `<option value="${d.type}">${esc(d.label)}${d.required ? ' (Required)' : ''}</option>`).join('')}</select>
            </div>
            <div class="ps-doc-list" id="ls-doc-list">${docList || '<p class="ps-doc-empty">No documents uploaded yet.</p>'}</div>
            ${fieldErr(errors, 'documents')}
          </div>
        </section>
      </form>`;
  }

  function readFormState(formEl, prev = {}) {
    const state = { ...prev };
    formEl.querySelectorAll('[data-ls-field]').forEach((el) => { state[el.dataset.lsField] = el.value; });
    formEl.querySelectorAll('[data-ls-bool]').forEach((el) => { state[el.dataset.lsBool] = el.checked; });
    state.plot_area_sqft = M().calcArea(state);
    state.buildable = M().calcBuildable(state);
    state.documents = prev.documents || [];
    return state;
  }

  function renderDocListHtml(state) {
    const docs = state.documents || [];
    if (!docs.length) return '<p class="ps-doc-empty">No documents uploaded yet.</p>';
    return docs.map((doc, i) => `
      <div class="ps-doc-row" data-doc-index="${i}">
        <span class="ps-doc-icon ps-doc-icon-pdf">DOC</span>
        <span class="ps-doc-name">${esc(doc.file_name)}</span>
        <span class="ps-doc-size">${doc.file_size ? Math.round(doc.file_size / 1024) + ' KB' : ''}</span>
        <button type="button" class="ps-doc-remove" data-ls-remove-doc="${i}">\u00D7</button>
      </div>`).join('');
  }

  function updateDocList(container, state, errors = {}, callbacks = {}) {
    const list = container.querySelector('#ls-doc-list');
    if (!list) return;
    list.innerHTML = renderDocListHtml(state);
    const errEl = container.querySelector('.ps-section:last-of-type .ps-field-error');
    const section = container.querySelector('#land-site-form .ps-section:last-of-type .ps-section-body');
    if (section) {
      const existing = section.querySelector('.ps-doc-errors');
      if (existing) existing.remove();
      if (errors.documents) {
        const div = document.createElement('div');
        div.className = 'ps-field-error ps-doc-errors';
        div.textContent = errors.documents;
        section.appendChild(div);
      }
    }
    container.querySelectorAll('[data-ls-remove-doc]').forEach((btn) => {
      btn.addEventListener('click', () => callbacks.onRemoveDoc?.(parseInt(btn.dataset.lsRemoveDoc, 10)));
    });
  }

  function bindForm(container, state, callbacks = {}) {
    const form = container.querySelector('#land-site-form');
    if (!form) return;

    const sync = () => {
      Object.assign(state, readFormState(form, state));
      updateCalcDisplays(state);
      callbacks.onChange?.(state);
    };

    form.addEventListener('input', sync);
    form.addEventListener('change', (e) => {
      if (e.target.dataset?.lsBool === 'is_corner_plot') {
        const row = document.getElementById('ls-second-road');
        if (row) row.style.display = e.target.checked ? '' : 'none';
      }
      sync();
    });

    const zone = container.querySelector('#ls-upload-zone');
    const fileInput = container.querySelector('#ls-file-input');
    if (zone && fileInput) {
      zone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        callbacks.onFiles?.(fileInput.files);
        fileInput.value = '';
      });
    }

    container.querySelectorAll('[data-ls-remove-doc]').forEach((btn) => {
      btn.addEventListener('click', () => callbacks.onRemoveDoc?.(parseInt(btn.dataset.lsRemoveDoc, 10)));
    });

    if (root.SearchableSelect) root.SearchableSelect.enhanceAll(container);
    updateCalcDisplays(state);
  }

  root.LandSiteForm = { renderForm, bindForm, readFormState, updateCalcDisplays, updateDocList, renderDocListHtml };
})(typeof window !== 'undefined' ? window : global);
