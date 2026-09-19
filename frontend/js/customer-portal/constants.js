// OH I SEE — Customer Portal constants
(function (root) {
  'use strict';

  const WORKFLOW_STEPS = [
    { n: 1, key: 'setup', label: 'Project Setup', slug: 'project-setup' },
    { n: 2, key: 'land', label: 'Land & Site', slug: 'land-site' },
    { n: 3, key: 'requirements', label: 'Requirements', slug: 'requirements' },
    { n: 4, key: 'design', label: 'Design & Engineering', slug: 'design' },
    { n: 5, key: 'quotes', label: 'Builder Quotes', slug: 'builder-quotes' },
    { n: 6, key: 'approvals', label: 'Approvals', slug: 'approvals' },
    { n: 7, key: 'execution', label: 'Project Execution', slug: 'execution' },
    { n: 8, key: 'handover', label: 'Handover & Maintenance', slug: 'handover' },
  ];

  const NEW_PROJECT_HREF = 'intent-engine.html?intent=NEW_HOME&step=1&portal=1&new=1';

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '&#9632;' },
    { id: 'new-project', label: 'New Project', icon: '+', externalHref: NEW_PROJECT_HREF },
    { id: 'drafts', label: 'Drafts', icon: '&#9998;' },
    { id: 'projects', label: 'My Projects', icon: '&#9776;' },
    { id: 'quotes', label: 'Builder Quotes', icon: '&#8361;' },
    { id: 'materials', label: 'Material Orders', icon: '&#9638;' },
    { id: 'payments', label: 'Payments', icon: '&#9670;' },
    { id: 'messages', label: 'Messages', icon: '&#9993;' },
    { id: 'site-updates', label: 'Site Updates', icon: '&#9650;' },
    { id: 'handover', label: 'Handover Documents', icon: '&#9783;' },
    { id: 'profile', label: 'My Profile', icon: '&#9679;' },
    { id: 'support', label: 'Support', icon: '?' },
  ];

  const PROJECT_STATUS_FILTERS = [
    'All', 'Drafts', 'Active', 'Completed',
  ];

  const MATERIAL_CATEGORIES = [
    'Cement', 'Steel', 'Bricks / Blocks', 'Sand', 'Aggregates', 'Electrical',
    'Plumbing', 'Tiles', 'Paint', 'Doors & Windows', 'Sanitaryware', 'Hardware',
    'Waterproofing', 'Roofing', 'HVAC', 'Kitchen', 'Lighting', 'Other',
  ];

  const HANDOVER_DOC_TYPES = [
    'Completion Certificate', 'Occupancy Certificate', 'Electrical Certificate',
    'Plumbing Certificate', 'Warranty Documents', 'Equipment Manuals', 'Final BOQ',
    'As-built Drawings', 'Final 2D Plan', 'Final 3D Model', 'Structural Documents',
    'Material Warranty', 'Builder Contract', 'Payment Receipts', 'Inspection Reports',
  ];

  root.CustomerPortalConstants = {
    WORKFLOW_STEPS, NAV_ITEMS, NEW_PROJECT_HREF, PROJECT_STATUS_FILTERS, MATERIAL_CATEGORIES, HANDOVER_DOC_TYPES,
  };
})(typeof window !== 'undefined' ? window : global);
