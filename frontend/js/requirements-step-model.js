// OH I SEE — Requirements step (Step 3) data model
(function (root) {
  'use strict';

  const FLOOR_OPTIONS = [
    'Ground Floor Only', 'G + 1 (2 Floors)', 'G + 2 (3 Floors)', 'G + 3 (4 Floors)', 'G + 4 (5 Floors)', '5+ Floors',
  ];

  const CONSTRUCTION_TYPES = ['New Construction', 'Renovation', 'Extension', 'Interior', 'Other'];
  const PRIMARY_USAGE = ['Self-use', 'Rental', 'Mixed Use', 'Commercial Use', 'Other'];
  const PROJECT_TYPES = [
    { value: 'Residential House', icon: 'home' },
    { value: 'Villa', icon: 'villa' },
    { value: 'Apartment', icon: 'apartment' },
    { value: 'Commercial', icon: 'commercial' },
    { value: 'Renovation', icon: 'reno' },
    { value: 'Other', icon: 'other' },
  ];

  const ROOM_FIELDS = [
    { key: 'qty_bedrooms', label: 'Bedrooms', required: true },
    { key: 'qty_bathrooms', label: 'Bathrooms', required: true },
    { key: 'qty_living', label: 'Living Room' },
    { key: 'qty_dining', label: 'Dining Room' },
    { key: 'qty_kitchen', label: 'Kitchen' },
    { key: 'qty_pooja', label: 'Pooja Room' },
    { key: 'qty_study', label: 'Home Office / Study' },
    { key: 'qty_guest', label: 'Guest Room' },
  ];

  const ROOM_SIZE_FIELDS = [
    { key: 'size_master_bedroom', label: 'Master Bedroom' },
    { key: 'size_bedroom_2', label: 'Bedroom 2' },
    { key: 'size_living', label: 'Living Room' },
    { key: 'size_kitchen', label: 'Kitchen' },
    { key: 'size_dining', label: 'Dining Room' },
    { key: 'size_pooja', label: 'Pooja Room' },
    { key: 'size_study', label: 'Home Office' },
  ];

  const HOME_FEATURES = [
    'Modular Kitchen', 'Home Automation', 'Solar Panels', 'Rainwater Harvesting',
    'EV Charging', 'Swimming Pool', 'Home Lift', 'CCTV Security', 'Landscaping',
    'Smart Lighting', 'Home Theatre', 'Central AC', 'Generator / Inverter', 'Outdoor Kitchen',
  ];

  const LIFESTYLE_CHECKS = [
    'Work from Home', 'Pet-friendly home', 'Future expansion', 'Need elder-friendly design',
    'Separate rental portion', 'Require accessible features (ramp, wider doors, etc.)',
  ];

  const PARKING_CHECKS = ['Basement Parking', 'Visitor Parking', 'Driver Room', 'Car Lift (if required)'];

  const STYLE_FIELDS = [
    { key: 'arch_style', label: 'Architectural Style', options: ['Modern', 'Contemporary', 'Traditional', 'South Indian Traditional', 'Minimalist', 'Colonial', 'No Preference'] },
    { key: 'interior_style', label: 'Interior Style', options: ['Contemporary', 'Modern', 'Traditional', 'Minimalist', 'Industrial', 'Scandinavian'] },
    { key: 'exterior_wall', label: 'Exterior Wall Finish', options: ['Concrete + Glass', 'Brick + Plaster', 'Stone Cladding', 'Wood Finish', 'Paint'] },
    { key: 'roof_type', label: 'Roof Type', options: ['RCC Flat Roof', 'Sloped Tile Roof', 'Metal Roof', 'Green Roof'] },
    { key: 'flooring_pref', label: 'Flooring Preference', options: ['Vitrified Tiles', 'Marble', 'Wooden', 'Granite', 'Mixed'] },
    { key: 'wall_finish', label: 'Wall Finish', options: ['Paint with Texture', 'Plain Paint', 'Wallpaper', 'Stone Cladding'] },
    { key: 'door_style', label: 'Door Style', options: ['Wooden', 'Flush', 'Panel', 'Glass'] },
    { key: 'window_style', label: 'Window Style', options: ['Sliding / Large Glass', 'Casement', 'Fixed Glass', 'UPVC'] },
    { key: 'kitchen_style', label: 'Kitchen Style', options: ['Modular', 'Semi-modular', 'Civil Kitchen', 'Open Kitchen'] },
    { key: 'bathroom_style', label: 'Bathroom Style', options: ['Modern', 'Classic', 'Luxury', 'Basic'] },
  ];

  const VASTU_DIRECTIONS = ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];
  const QUALITY_LEVELS = ['Economic — Budget-conscious', 'Standard — Balanced quality', 'Premium — Higher-end finishes'];
  const MATERIAL_PREFS = ['Branded Materials', 'Standard Materials', 'Budget Materials', 'Mixed'];

  function defaults(setup = {}, land = {}) {
    const floorsMap = {
      'Ground Floor Only': 'Ground Floor Only',
      'G + 1': 'G + 1 (2 Floors)', 'G + 2': 'G + 2 (3 Floors)', 'G + 3': 'G + 3 (4 Floors)',
      'G + 4': 'G + 4 (5 Floors)', '5+ Floors': '5+ Floors',
    };
    const budget = setup.estimated_budget ? String(setup.estimated_budget).replace(/[^\d]/g, '') : '';
    return {
      floors: floorsMap[setup.floors] || 'G + 1 (2 Floors)',
      built_up_area: setup.built_up_area || '',
      construction_type: setup.construction_type || 'New Construction',
      primary_usage: 'Self-use',
      project_type: setup.project_type || 'Residential House',
      qty_bedrooms: '3', qty_bathrooms: '2', qty_living: '1', qty_dining: '1',
      qty_kitchen: '1', qty_pooja: setup.features?.pooja ? '1' : '0',
      qty_study: '0', qty_guest: '0',
      custom_rooms: [],
      size_master_bedroom: '', size_bedroom_2: '', size_living: '', size_kitchen: '',
      size_dining: '', size_pooja: '', size_study: '',
      car_parking: '2', two_wheeler_parking: '2', covered_parking: 'Yes', ev_charging: 'Yes',
      parking_checks: [],
      family_members: '4', adults: '2', children: '2', elderly_members: '0',
      lifestyle_checks: [],
      home_features: [],
      other_features: '',
      arch_style: 'Modern', interior_style: 'Contemporary', exterior_wall: 'Concrete + Glass',
      roof_type: 'RCC Flat Roof', flooring_pref: 'Vitrified Tiles', wall_finish: 'Paint with Texture',
      door_style: 'Wooden', window_style: 'Sliding / Large Glass', kitchen_style: 'Modular', bathroom_style: 'Modern',
      follow_vastu: 'Yes', entrance_direction: land.road_facing || setup.facing_direction || 'North-East',
      pooja_direction: 'North-East', kitchen_direction: 'South-East', vastu_notes: '',
      budget_construction: '', budget_interior: '', budget_landscape: '',
      contingency_pct: '10', quality: 'Standard — Balanced quality', material_preference: 'Branded Materials',
      budget_exceeded_acknowledged: false,
      special_requirements: setup.additional_notes || '',
      things_to_avoid: '',
      reference_files: [],
      bedrooms: '3 Bedrooms', bathrooms: '2', parking: '1 Car',
      has_pooja: setup.features?.pooja ? 'Yes' : 'No', has_office: 'No', has_terrace: setup.features?.terrace ? 'Yes' : 'No',
      vastu: 'Partly follow Vastu', budget_mode: budget ? 'manual' : '', budget,
      plot_length: land.plot_length_ft || '', plot_width: land.plot_width_ft || '',
      ...Object.fromEntries(['setback_front_ft','setback_rear_ft','setback_left_ft','setback_right_ft'].map(k => [k, land[k] ?? 0])),
      road_facing: land.road_facing || setup.facing_direction || 'East',
      location: setup.city && setup.state ? `${setup.city}, ${setup.state}` : '',
      total_project_budget: budget,
    };
  }

  function parseNum(v) {
    const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function budgetAllocation(req) {
    const construction = parseNum(req.budget_construction);
    const interior = parseNum(req.budget_interior);
    const landscape = parseNum(req.budget_landscape);
    const subtotal = construction + interior + landscape;
    const contingency = subtotal * (parseNum(req.contingency_pct) / 100);
    const total = subtotal + contingency;
    const projectBudget = parseNum(req.total_project_budget || req.budget);
    return { construction, interior, landscape, subtotal, contingency, total, projectBudget, exceeds: projectBudget > 0 && total > projectBudget };
  }

  function floorCount(value) {
    if (typeof value === 'number') return Math.max(1, value);
    const s = String(value || '');
    const g = s.match(/G\s*\+\s*(\d+)/i);
    if (g) return Number(g[1]) + 1;
    if (/ground/i.test(s)) return 1;
    return Math.max(1, Number.parseInt(s, 10) || 1);
  }

  function areaValidation(req, land = {}) {
    const errors = {};
    const length = Number(land.plot_length_ft ?? req.plot_length);
    const width = Number(land.plot_width_ft ?? req.plot_width);
    const plot = Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0 ? length * width : 0;
    const floors = floorCount(req.floors);
    const built = Number(String(req.built_up_area || '').replace(/,/g, '').replace(/\s*sq\.?\s*ft.*$/i, ''));
    const setbacks = ['setback_front_ft','setback_rear_ft','setback_left_ft','setback_right_ft'].map(key => Number(land[key] ?? req[key] ?? 0));
    if (setbacks.some(n => !Number.isFinite(n) || n < 0)) errors.plot_size = 'Setbacks must be non-negative numbers.';
    const [front,rear,left,right] = setbacks.map(n => Number.isFinite(n) && n >= 0 ? n : 0);
    const footprint = plot ? Math.max(0, length-left-right) * Math.max(0, width-front-rear) : 0;
    const capacity = footprint * floors;
    if (!Number.isInteger(floors) || floors > 100) errors.floors = 'Enter a valid whole number of floors.';
    if (plot && !footprint) errors.plot_size = 'Setbacks leave no buildable area. Review Land & Site.';
    if (!plot) errors.plot_size = 'Enter valid plot length and width in Land & Site.';
    if (!Number.isFinite(built) || built <= 0) errors.built_up_area = 'Enter a positive built-up area.';
    else if (capacity && built > capacity) errors.built_up_area = `Built-up area cannot exceed ${capacity.toLocaleString('en-IN')} sq.ft across ${floors} floors after the entered setbacks.`;
    const counts = {
      size_master_bedroom: Math.min(1, Number(req.qty_bedrooms) || 0),
      size_bedroom_2: Math.max(0, (Number(req.qty_bedrooms) || 0) - 1),
      size_living: Number(req.qty_living) || 0, size_kitchen: Number(req.qty_kitchen) || 0,
      size_dining: Number(req.qty_dining) || 0, size_pooja: Number(req.qty_pooja) || 0,
      size_study: Number(req.qty_study) || 0,
    };
    for (const f of ROOM_FIELDS) {
      if (req[f.key] == null || req[f.key] === '') continue;
      const count = Number(req[f.key]);
      if (!Number.isInteger(count) || count < (f.required ? 1 : 0) || count > 100) errors[f.key] = `${f.label} must be a whole number between ${f.required ? 1 : 0} and 100.`;
    }
    let roomArea = 0;
    for (const f of ROOM_SIZE_FIELDS) {
      if (req[f.key] === '' || req[f.key] == null) continue;
      const n = Number(req[f.key]);
      if (!Number.isFinite(n) || n <= 0) errors[f.key] = 'Room size must be a positive number.';
      else if (footprint && n > footprint) errors[f.key] = `${f.label} cannot exceed the ${footprint.toLocaleString('en-IN')} sq.ft buildable footprint.`;
      if (Number.isFinite(n) && n > 0) roomArea += n * Math.max(1, counts[f.key]);
    }
    if (req.custom_rooms && !Array.isArray(req.custom_rooms)) errors.room_area = 'Custom rooms must be a list.';
    for (const room of Array.isArray(req.custom_rooms) ? req.custom_rooms : []) {
      if (room.size != null && room.size !== '') {
        const n = Number(room.size), qty = Number(room.qty || 1);
        if (!Number.isFinite(n) || n <= 0 || n > footprint || !Number.isInteger(qty) || qty < 1) errors.room_area = 'Custom room sizes and quantities must be positive and fit the plot.';
        else roomArea += n * qty;
      }
    }
    const available = Math.min(built > 0 ? built : capacity, capacity || Infinity);
    if (available > 0 && roomArea > available) errors.room_area = `Specified rooms need ${roomArea.toLocaleString('en-IN')} sq.ft; only ${available.toLocaleString('en-IN')} sq.ft is available. Reduce room sizes or quantities.`;
    return { errors, plot, footprint, floors, capacity, built, roomArea, remaining: Math.max(0, available - roomArea) };
  }

  function autoRoomSizes(req) {
    const clean={...req}; ROOM_SIZE_FIELDS.forEach(f=>{clean[f.key]='';});
    const area=areaValidation(clean);
    if(Object.keys(area.errors).length) throw new Error(Object.values(area.errors)[0]);
    const n=k=>Number(req[k]||0);
    const rooms=[['size_master_bedroom',Math.min(1,n('qty_bedrooms')),120],['size_bedroom_2',Math.max(0,n('qty_bedrooms')-1),100],['size_living',n('qty_living'),140],['size_kitchen',n('qty_kitchen'),80],['size_dining',n('qty_dining'),80],['size_pooja',n('qty_pooja'),30],['size_study',n('qty_study'),70]];
    const baseline=rooms.reduce((sum,[,qty,size])=>sum+qty*size,0);
    if(!baseline) throw new Error('Select room quantities before calculating sizes.');
    const reserve=area.built*0.25+n('qty_bathrooms')*40+n('qty_guest')*100;
    const available=area.built-reserve-area.roomArea;
    if(available<baseline) throw new Error('The entered built-up area is too small for these room quantities. Increase Built-up area or reduce rooms before auto calculating.');
    const sizes={};
    rooms.forEach(([key,qty,size])=>{sizes[key]=qty?Math.floor(Math.min(area.footprint,size*available/baseline)):'';});
    const result=areaValidation({...req,...sizes});
    if(Object.keys(result.errors).length) throw new Error(Object.values(result.errors)[0]);
    return {sizes,reserved:reserve,remaining:result.remaining};
  }

  function validate(req, { allowBudgetOverride = false } = {}) {
    const errors = {};
    if (!req.floors) errors.floors = 'Select number of floors.';
    if (!String(req.built_up_area || '').trim()) errors.built_up_area = 'Built-up area is required.';
    if (!req.construction_type) errors.construction_type = 'Construction type is required.';
    if (!req.primary_usage) errors.primary_usage = 'Primary usage is required.';
    if (!req.project_type) errors.project_type = 'Select project type.';
    if (!parseInt(req.qty_bedrooms, 10)) errors.qty_bedrooms = 'Bedrooms is required.';
    if (!parseInt(req.qty_bathrooms, 10)) errors.qty_bathrooms = 'Bathrooms is required.';
    if (!req.quality) errors.quality = 'Select quality level.';
    Object.assign(errors, areaValidation(req).errors);
    const b = budgetAllocation(req);
    if (b.exceeds && !allowBudgetOverride && !req.budget_exceeded_acknowledged) {
      errors.budget_allocation = 'Your current allocation exceeds the project budget.';
    }
    return { valid: Object.keys(errors).length === 0, errors, budget: b };
  }

  function toIntentAnswers(req) {
    const beds = parseInt(req.qty_bedrooms, 10) || 3;
    return {
      ...req,
      location: req.location, plot_length: req.plot_length, plot_width: req.plot_width, road_facing: req.road_facing,
      floors: req.floors, bedrooms: `${beds} Bedroom${beds > 1 ? 's' : ''}`,
      bathrooms: String(req.qty_bathrooms), parking: req.car_parking ? `${req.car_parking} Car` : req.parking,
      has_pooja: parseInt(req.qty_pooja, 10) > 0 ? 'Yes' : 'No',
      has_office: parseInt(req.qty_study, 10) > 0 ? 'Yes' : 'No',
      has_terrace: req.has_terrace || 'No', vastu: req.follow_vastu === 'Yes' ? 'Yes — follow Vastu' : req.vastu || 'Partly follow Vastu',
      vastu_notes: req.vastu_notes, arch_style: req.arch_style, quality: req.quality,
      budget_mode: req.budget_mode || 'quality', budget: req.budget || req.total_project_budget,
      budget_construction: req.budget_construction, budget_interior: req.budget_interior, budget_landscape: req.budget_landscape,
      extras: req.special_requirements, lifestyle_notes: req.lifestyle_checks?.join(', '),
      home_features: req.home_features, room_quantities: ROOM_FIELDS.reduce((a, r) => { a[r.key] = req[r.key]; return a; }, {}),
      reference_files: req.reference_files, custom_rooms: req.custom_rooms,
    };
  }

  function requirementsHash(req) {
    return JSON.stringify(toIntentAnswers(req));
  }

  const api = {
    defaults, validate, toIntentAnswers, budgetAllocation, requirementsHash, parseNum, areaValidation, floorCount, autoRoomSizes,
    FLOOR_OPTIONS, CONSTRUCTION_TYPES, PRIMARY_USAGE, PROJECT_TYPES, ROOM_FIELDS, ROOM_SIZE_FIELDS,
    HOME_FEATURES, LIFESTYLE_CHECKS, PARKING_CHECKS, STYLE_FIELDS, VASTU_DIRECTIONS, QUALITY_LEVELS, MATERIAL_PREFS,
  };
  root.RequirementsStepModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
