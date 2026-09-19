// OH I SEE — Project Setup (Step 1.1 Project Details) model & validation
(function (root) {
  'use strict';

  const PROJECT_TYPES = [
    'Residential House', 'Villa', 'Apartment', 'Commercial Building', 'Renovation', 'Other',
  ];

  const CONSTRUCTION_TYPES = [
    'New Construction', 'Renovation', 'Extension', 'Interior', 'Other',
  ];

  const OWNERSHIP_STATUS = [
    'I own the land',
    'Joint ownership',
    'Land purchase in progress',
    'Land not purchased yet',
  ];

  const URGENCY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent'];

  const FLOOR_OPTIONS = [
    'Ground Floor Only', 'G + 1', 'G + 2', 'G + 3', 'G + 4', '5+ Floors',
  ];

  const FACING_OPTIONS = [
    'North', 'South', 'East', 'West',
    'North-East', 'North-West', 'South-East', 'South-West',
  ];

  const FEATURE_KEYS = [
    { key: 'basement', label: 'Basement' },
    { key: 'terrace', label: 'Terrace' },
    { key: 'parking', label: 'Parking' },
    { key: 'lift', label: 'Lift' },
    { key: 'garden', label: 'Garden' },
    { key: 'landscaping', label: 'Landscaping' },
    { key: 'balcony', label: 'Balcony' },
    { key: 'swimming_pool', label: 'Swimming Pool' },
    { key: 'solar', label: 'Solar' },
    { key: 'rainwater_harvesting', label: 'Rainwater Harvesting' },
    { key: 'compound_wall', label: 'Compound Wall' },
    { key: 'security_room', label: 'Security Room' },
  ];

  const DOCUMENT_TYPES = [
    { type: 'land_ownership', label: 'Land Ownership Document', required: true },
    { type: 'sale_deed', label: 'Sale Deed', required: false },
    { type: 'patta', label: 'Patta', required: false },
    { type: 'property_tax', label: 'Property Tax Receipt', required: false },
    { type: 'survey_plan', label: 'Survey Plan', required: false },
    { type: 'site_map', label: 'Site Location Map', required: false },
    { type: 'existing_plan', label: 'Existing Building Plan', required: false },
    { type: 'previous_approval', label: 'Previous Approval Documents', required: false },
    { type: 'other', label: 'Other Documents', required: false },
  ];

  const CITY_COORDS = {
    Chennai: [13.0827, 80.2707],
    Coimbatore: [11.0168, 76.9558],
    Madurai: [9.9252, 78.1198],
    Salem: [11.6643, 78.1460],
    Tiruchirappalli: [10.7905, 78.7047],
    Tirunelveli: [8.7139, 77.7567],
    Erode: [11.3410, 77.7172],
    Vellore: [12.9165, 79.1325],
    Bengaluru: [12.9716, 77.5946],
    Mumbai: [19.0760, 72.8777],
    Pune: [18.5204, 73.8567],
    Hyderabad: [17.3850, 78.4867],
    'New Delhi': [28.6139, 77.2090],
    Ahmedabad: [23.0225, 72.5714],
    Kochi: [9.9312, 76.2673],
    Thiruvananthapuram: [8.5241, 76.9366],
  };

  function getCityCenter(city, state) {
    if (city && CITY_COORDS[city]) return CITY_COORDS[city];
    const cities = INDIAN_STATES[state];
    if (cities?.length && CITY_COORDS[cities[0]]) return CITY_COORDS[cities[0]];
    return [20.5937, 78.9629];
  }

  const INDIAN_STATES = {
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli', 'Tirunelveli', 'Erode', 'Vellore'],
    'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'],
    'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi'],
    'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane'],
    'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad'],
    'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati'],
    'Delhi': ['New Delhi', 'South Delhi', 'North Delhi'],
    'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
  };

  const COUNTRY_CODES = [
    { code: '+91', label: 'India (+91)' },
    { code: '+1', label: 'USA (+1)' },
    { code: '+44', label: 'UK (+44)' },
    { code: '+971', label: 'UAE (+971)' },
  ];

  const ALLOWED_MIME = [
    'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
    'application/acad', 'image/vnd.dwg', 'application/dxf', 'application/x-dxf',
  ];
  const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.dwg', '.dxf'];
  const MAX_FILE_BYTES = 25 * 1024 * 1024;

  function defaults() {
    return {
      project_name: '',
      project_type: 'Residential House',
      construction_type: 'New Construction',
      description: '',
      owner_name: '',
      owner_email: '',
      phone_country: '+91',
      owner_phone: '',
      owner_phone_alt: '',
      ownership_status: 'I own the land',
      owner_address: '',
      site_address: '',
      state: 'Tamil Nadu',
      city: 'Coimbatore',
      district: '',
      pincode: '',
      latitude: '',
      longitude: '',
      survey_number: '',
      sub_division_number: '',
      construction_duration: '',
      preferred_start_month: '',
      urgency: 'Normal',
      floors: 'G + 1',
      built_up_area: '',
      facing_direction: 'North',
      features: {},
      additional_notes: '',
      start_date: '',
      target_completion_date: '',
      estimated_budget: '',
      documents: [],
      setup_step: 1,
      completion_percentage: 0,
    };
  }

  function fromAnswers(answers) {
    const d = defaults();
    if (!answers || typeof answers !== 'object') return d;
    const ps = answers.projectSetup || answers;
    Object.keys(d).forEach((k) => {
      if (ps[k] !== undefined && ps[k] !== null) d[k] = ps[k];
    });
    if (answers.project_name && !d.project_name) d.project_name = answers.project_name;
    if (answers.owner_name && !d.owner_name) d.owner_name = answers.owner_name;
    return d;
  }

  function toAnswers(form) {
    return { projectSetup: { ...form }, project_name: form.project_name };
  }

  function formatINR(value) {
    const n = Number(String(value).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n)) return '';
    return '₹' + n.toLocaleString('en-IN');
  }

  function parseINR(value) {
    const n = Number(String(value).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function validatePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  function validatePincode(pin) {
    return /^\d{6}$/.test(String(pin || '').trim());
  }

  const REQUIRED_FIELDS = [
    'project_name', 'project_type', 'construction_type', 'description', 'owner_name', 'owner_email',
    'owner_phone', 'ownership_status', 'owner_address', 'site_address', 'state', 'city', 'pincode',
    'floors', 'built_up_area', 'start_date', 'target_completion_date',
  ];

  const FIELD_LABELS = {
    project_name: 'Project name',
    project_type: 'Project type',
    construction_type: 'Construction type',
    description: 'Project description',
    ownership_status: 'Ownership status',
    owner_name: 'Owner / client name',
    owner_email: 'Email address',
    owner_phone: 'Phone number',
    owner_address: 'Address',
    site_address: 'Site / plot address',
    state: 'State',
    city: 'City',
    pincode: 'Pincode',
    floors: 'Number of floors',
    built_up_area: 'Built-up area',
    start_date: 'Start date',
    target_completion_date: 'Target completion date',
  };

  function hasOwnershipDoc(documents) {
    const accepted = ['land_ownership', 'sale_deed', 'patta', 'ownership_deed'];
    return (documents || []).some(
      (d) => accepted.includes(d.document_type) && d.file_name
        && (d.status === 'uploaded' || d.status === 'pending' || d.local === true || !d.status)
    );
  }

  function validate(form, { draft = false } = {}) {
    const errors = {};
    if (draft) return { valid: true, errors };

    for (const key of REQUIRED_FIELDS) {
      const val = String(form[key] ?? '').trim();
      if (!val) errors[key] = `${FIELD_LABELS[key] || key} is required.`;
    }

    if (form.owner_email && !validateEmail(form.owner_email)) {
      errors.owner_email = 'Please enter a valid email address.';
    }
    if (form.owner_phone && !validatePhone(form.owner_phone)) {
      errors.owner_phone = 'Please enter a valid phone number (10–15 digits).';
    }
    if (form.pincode && !validatePincode(form.pincode)) {
      errors.pincode = 'Pincode must be 6 digits.';
    }
    const area = parseFloat(form.built_up_area);
    if (form.built_up_area && (!Number.isFinite(area) || area <= 0)) {
      errors.built_up_area = 'Built-up area must be greater than 0.';
    }
    const budget = parseINR(form.estimated_budget);
    if (form.estimated_budget && budget < 0) {
      errors.estimated_budget = 'Budget cannot be negative.';
    }
    if (form.start_date && form.target_completion_date) {
      if (new Date(form.target_completion_date) < new Date(form.start_date)) {
        errors.target_completion_date = 'Target completion date must be after the start date.';
      }
    }
    if (form.description && form.description.length > 500) {
      errors.description = 'Description must be 500 characters or fewer.';
    }

    if (!hasOwnershipDoc(form.documents) && !draft) {
      errors.documents = 'Land ownership document is required before continuing.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
  }

  function completionStats(form) {
    let requiredDone = 0;
    for (const key of REQUIRED_FIELDS) {
      if (String(form[key] ?? '').trim()) requiredDone += 1;
    }
    const requiredTotal = REQUIRED_FIELDS.length;
    const hasOwnership = hasOwnershipDoc(form.documents);
    const docScore = hasOwnership ? 1 : 0;
    const pct = Math.round(((requiredDone / requiredTotal) * 0.85 + docScore * 0.15) * 100);
    return { requiredDone, requiredTotal, percentage: Math.min(100, pct), hasOwnership };
  }

  function floorsToInt(floors) {
    const map = {
      'Ground Floor Only': 1, 'G + 1': 2, 'G + 2': 3, 'G + 3': 4, 'G + 4': 5, '5+ Floors': 5,
    };
    return map[floors] || 1;
  }

  function toProjectPayload(form, { intentType = 'NEW_HOME', projectId = null } = {}) {
    const budget = parseINR(form.estimated_budget);
    const features = form.features || {};
    return {
      project_id: projectId || undefined,
      project_name: form.project_name.trim(),
      project_type: form.project_type,
      description: form.description.trim(),
      state: form.state,
      city: form.city,
      location: `${form.city}, ${form.state}`,
      built_up_area: form.built_up_area ? `${form.built_up_area} sq.ft` : '',
      floors: floorsToInt(form.floors),
      budget,
      estimated_cost: budget || 0,
      intent_type: intentType,
      current_stage: 'Project Setup',
      status: 'draft',
      acceptance_status: 'pending_vendor',
      construction_context: {
        projectSetup: { ...form, completion_percentage: completionStats(form).percentage },
        setupCompleted: false,
        intentType,
      },
      client_name: form.owner_name,
    };
  }

  function validateFile(file) {
    if (!file) return { ok: false, error: 'No file selected.' };
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'Maximum file size is 25 MB.' };
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return { ok: false, error: 'Supported formats: PDF, JPG, PNG, DWG, DXF.' };
    }
    return { ok: true };
  }

  const api = {
    defaults,
    fromAnswers,
    toAnswers,
    hasOwnershipDoc,
    validate,
    completionStats,
    toProjectPayload,
    formatINR,
    parseINR,
    validateFile,
    PROJECT_TYPES,
    CONSTRUCTION_TYPES,
    OWNERSHIP_STATUS,
    URGENCY_OPTIONS,
    FLOOR_OPTIONS,
    FACING_OPTIONS,
    FEATURE_KEYS,
    DOCUMENT_TYPES,
    INDIAN_STATES,
    CITY_COORDS,
    getCityCenter,
    COUNTRY_CODES,
    MAX_FILE_BYTES,
    REQUIRED_FIELDS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ProjectSetupModel = api;
})(typeof window !== 'undefined' ? window : global);
