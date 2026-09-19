// OH I SEE — Land & Site (Step 2) model
(function (root) {
  'use strict';

  const PLOT_SHAPES = [
    { value: 'rectangle', label: 'Rectangular' },
    { value: 'square', label: 'Square' },
    { value: 'l_shape', label: 'L-shaped' },
    { value: 'irregular', label: 'Irregular' },
    { value: 'corner', label: 'Corner Plot' },
    { value: 'other', label: 'Other' },
  ];

  const ROAD_FACING = ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];

  const ACCESS_ROAD_TYPES = ['Municipal Road', 'Panchayat Road', 'Private Road', 'Highway', 'Other'];

  const SOIL_TYPES = ['Normal / Unknown', 'Soft Soil', 'Rocky', 'Black Cotton Soil', 'Filled Land', 'Sloped Terrain'];

  const LAND_USE = ['Residential', 'Commercial', 'Mixed Use', 'Agricultural (conversion)', 'Industrial', 'Not Sure'];

  const SLOPE_OPTIONS = ['Flat', 'Gentle Slope', 'Moderate Slope', 'Steep Slope'];
  const DRAINAGE_OPTIONS = ['Good', 'Average', 'Poor', 'Unknown'];
  const UTILITY_OPTIONS = ['Available', 'Not Available', 'Can Be Arranged', 'Unknown'];

  const LAND_DOCUMENT_TYPES = [
    { type: 'land_ownership', label: 'Land Ownership Document', required: true },
    { type: 'patta', label: 'Patta', required: false },
    { type: 'sale_deed', label: 'Sale Deed', required: false },
    { type: 'survey_plan', label: 'Survey Plan', required: false },
    { type: 'fmb_sketch', label: 'FMB / Measurement Sketch', required: false },
    { type: 'property_tax', label: 'Property Tax Receipt', required: false },
    { type: 'site_layout', label: 'Site Layout', required: false },
    { type: 'soil_test', label: 'Soil Test Report', required: false },
    { type: 'site_photo', label: 'Site Photos', required: false },
    { type: 'other', label: 'Other', required: false },
  ];

  function defaults(projectSetup = {}) {
    return {
      plot_length_ft: '',
      plot_width_ft: '',
      plot_shape: 'rectangle',
      road_facing: projectSetup.facing_direction || 'East',
      road_width_ft: '',
      access_road_type: 'Municipal Road',
      is_corner_plot: false,
      road_sides_count: '1',
      main_entrance_road: '',
      second_road_facing: 'North',
      setback_front_ft: '10',
      setback_rear_ft: '5',
      setback_left_ft: '5',
      setback_right_ft: '5',
      soil_type: 'Normal / Unknown',
      slope: 'Flat',
      drainage_condition: 'Good',
      existing_structures: '',
      trees_on_site: '',
      water_availability: 'Unknown',
      electricity_availability: 'Unknown',
      sewer_availability: 'Unknown',
      gas_availability: 'Unknown',
      flood_risk: 'Unknown',
      site_access: '',
      land_use_zone: 'Residential',
      site_notes: '',
      site_address: projectSetup.site_address || '',
      site_state: projectSetup.state || '',
      site_city: projectSetup.city || '',
      site_pincode: projectSetup.pincode || '',
      site_survey_number: projectSetup.survey_number || '',
      site_latitude: projectSetup.latitude || '',
      site_longitude: projectSetup.longitude || '',
      plot_area_sqft: '',
      documents: [],
    };
  }

  function fromStored(ctx) {
    const ls = ctx?.landSite || {};
    const d = defaults(ctx?.projectSetup || {});
    return { ...d, ...ls };
  }

  function calcArea(state) {
    const l = parseFloat(state.plot_length_ft);
    const w = parseFloat(state.plot_width_ft);
    if (!Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) return null;
    return Math.round(l * w);
  }

  function calcBuildable(state) {
    const l = parseFloat(state.plot_length_ft);
    const w = parseFloat(state.plot_width_ft);
    const sf = parseFloat(state.setback_front_ft) || 0;
    const sr = parseFloat(state.setback_rear_ft) || 0;
    const sl = parseFloat(state.setback_left_ft) || 0;
    const srt = parseFloat(state.setback_right_ft) || 0;
    if (!Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) {
      return { buildable_length: null, buildable_width: null, buildable_area: null, plot_area: null };
    }
    const plotArea = Math.round(l * w);
    const bl = Math.max(0, l - sl - srt);
    const bw = Math.max(0, w - sf - sr);
    return {
      plot_area: plotArea,
      buildable_length: Math.round(bl * 10) / 10,
      buildable_width: Math.round(bw * 10) / 10,
      buildable_area: Math.round(bl * bw),
    };
  }

  function hasLandOwnershipDoc(documents) {
    const accepted = ['land_ownership', 'sale_deed', 'patta', 'ownership_deed'];
    return (documents || []).some(
      (d) => accepted.includes(d.document_type) && d.file_name
        && (d.status === 'uploaded' || d.status === 'pending' || d.local === true || !d.status)
    );
  }

  function validate(state, { draft = false } = {}) {
    const errors = {};
    if (draft) return { valid: true, errors };

    const l = parseFloat(state.plot_length_ft);
    const w = parseFloat(state.plot_width_ft);
    if (!Number.isFinite(l) || l <= 0) errors.plot_length_ft = 'Plot length is required (feet).';
    if (!Number.isFinite(w) || w <= 0) errors.plot_width_ft = 'Plot width is required (feet).';
    if (state.plot_shape === 'square' && Number.isFinite(l) && Number.isFinite(w) && l !== w) {
      errors.plot_shape = 'Square plot requires equal length and width.';
    }
    if (!state.road_facing) errors.road_facing = 'Road facing direction is required.';
    if (!state.access_road_type) errors.access_road_type = 'Access road type is required.';
    if (state.is_corner_plot && state.second_road_facing === state.road_facing) {
      errors.second_road_facing = 'Second road must face a different direction.';
    }
    ['setback_front_ft', 'setback_rear_ft', 'setback_left_ft', 'setback_right_ft'].forEach((k) => {
      const v = parseFloat(state[k]);
      if (!Number.isFinite(v) || v < 0) errors[k] = 'Setback must be 0 or greater.';
    });
    const b = calcBuildable(state);
    if (b.buildable_area !== null && b.buildable_area <= 0) {
      errors.setback_front_ft = 'Setbacks are too large for this plot size.';
    }
    if (!hasLandOwnershipDoc(state.documents)) {
      errors.documents = 'Land ownership document is required for Land & Site.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function toProjectFields(state) {
    const area = calcArea(state);
    const b = calcBuildable(state);
    return {
      plot_length: parseFloat(state.plot_length_ft) || null,
      plot_width: parseFloat(state.plot_width_ft) || null,
      plot_size: area ? `${state.plot_length_ft} x ${state.plot_width_ft} ft` : null,
      road_facing: state.road_facing,
      buildable_area_sqft: b.buildable_area,
    };
  }

  const api = {
    defaults, fromStored, calcArea, calcBuildable, validate, toProjectFields, hasLandOwnershipDoc,
    PLOT_SHAPES, ROAD_FACING, ACCESS_ROAD_TYPES, SOIL_TYPES, LAND_USE,
    SLOPE_OPTIONS, DRAINAGE_OPTIONS, UTILITY_OPTIONS, LAND_DOCUMENT_TYPES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LandSiteModel = api;
})(typeof window !== 'undefined' ? window : global);
