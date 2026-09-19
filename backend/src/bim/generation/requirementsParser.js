'use strict';

/**
 * Converts OH I SEE project / intent data into structured building requirements.
 * Does NOT call AI — deterministic mapping from existing form fields.
 */
function parseFloorsLabel(label) {
  if (typeof label === 'number' && Number.isFinite(label) && label >= 1) {
    return Math.min(4, Math.floor(label));
  }
  const s = String(label || '').toLowerCase();
  if (s.includes('g + 3') || s.includes('g+3')) return 4;
  if (s.includes('g + 2') || s.includes('g+2')) return 3;
  if (s.includes('g + 1') || s.includes('g+1')) return 2;
  const num = parseInt(s, 10);
  if (Number.isFinite(num) && num >= 1) return Math.min(4, num);
  return 1;
}

function normalizeQualityLevel(value) {
  const s = String(value || '').toLowerCase();
  if (s.includes('economic') || s.includes('budget-conscious')) return 'Economic';
  if (s.includes('premium') || s.includes('higher-end')) return 'Premium';
  if (s.includes('custom')) return 'Custom';
  if (s.includes('standard') || s.includes('balanced')) return 'Standard';
  return 'Standard';
}

function normalizeVastu(value) {
  const s = String(value || '').toLowerCase();
  if (!s.trim()) return '';
  if (s.includes('no') && !s.includes('know')) return 'No';
  if (s.includes('partly') || s.includes('partial')) return 'Partly';
  if (s.includes('yes') || s.includes('follow')) return 'Yes';
  return 'Partly';
}

function normalizeRoadFacing(value) {
  const s = String(value || 'East').trim();
  const allowed = ['North', 'South', 'East', 'West', 'Corner'];
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (allowed.includes(cap)) return cap;
  if (s.toLowerCase().includes('corner')) return 'Corner';
  return 'East';
}

function parseBedrooms(label) {
  const m = String(label || '').match(/(\d+)/);
  return m ? Math.min(10, parseInt(m[1], 10)) : 3;
}

function parseBathrooms(label) {
  const m = String(label || '').match(/(\d+)/);
  return m ? Math.min(10, parseInt(m[1], 10)) : 2;
}

function parseParking(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('none') || s.includes('no ')) return 0;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function ftToM(ft) {
  return Math.round((Number(ft) || 0) * 0.3048 * 1000) / 1000;
}

function buildStoreys(floorCount) {
  const storeys = [];
  const names = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];
  for (let i = 0; i < floorCount; i++) {
    storeys.push({
      index: i,
      name: names[i] || `Floor ${i}`,
      elevationM: i * 3.0,
      clearHeightM: 3.0,
    });
  }
  return storeys;
}

function defaultRooms(bedrooms, bathrooms, flags) {
  const rooms = [
    { name: 'Living Room', type: 'living', storeyIndex: 0, lengthFt: 16, widthFt: 14 },
    { name: 'Kitchen', type: 'kitchen', storeyIndex: 0, lengthFt: 12, widthFt: 10 },
    { name: 'Dining', type: 'dining', storeyIndex: 0, lengthFt: 12, widthFt: 10 },
  ];
  for (let i = 1; i <= bedrooms; i++) {
    rooms.push({ name: `Bedroom ${i}`, type: 'bedroom', storeyIndex: i > 2 ? 1 : 0, lengthFt: 12, widthFt: 11 });
  }
  for (let i = 1; i <= bathrooms; i++) {
    rooms.push({ name: `Bathroom ${i}`, type: 'bathroom', storeyIndex: 0, lengthFt: 8, widthFt: 6 });
  }
  if (flags.hasPooja) rooms.push({ name: 'Pooja Room', type: 'pooja', storeyIndex: 0, lengthFt: 6, widthFt: 6 });
  if (flags.hasOffice) rooms.push({ name: 'Home Office', type: 'office', storeyIndex: 0, lengthFt: 10, widthFt: 9 });
  if (flags.hasTerrace) rooms.push({ name: 'Terrace', type: 'terrace', storeyIndex: 1, lengthFt: 14, widthFt: 12 });
  if (flags.parking > 0) rooms.push({ name: 'Car Parking', type: 'parking', storeyIndex: 0, lengthFt: 18, widthFt: 10 });
  return rooms;
}

function fromProject(project) {
  const ctx = project.construction_context || {};
  const answers = {...(ctx.homeRequirements||{}),...(ctx.intentAnswers||{}),...(ctx.projectRequirements||{})};
  const land=ctx.landSite||{};
  const hr = ctx.homeRequirements || {};

  const plotLengthFt = Math.max(10, Number(land.plot_length_ft || answers.plot_length || project.plot_length || hr.plot?.lengthFt || hr.plotLength || 40) || 40);
  const plotWidthFt = Math.max(10, Number(land.plot_width_ft || answers.plot_width || project.plot_width || hr.plot?.widthFt || hr.plotWidth || 30) || 30);
  const floors = parseFloorsLabel(answers.floors || project.floors || hr.building?.floors || 'Ground Floor Only');
  const bedrooms = parseBedrooms(answers.qty_bedrooms ?? answers.bedrooms ?? project.bedrooms ?? hr.building?.bedrooms ?? '3 Bedrooms');
  const bathrooms = parseBathrooms(answers.qty_bathrooms ?? answers.bathrooms ?? project.bathrooms ?? hr.building?.bathrooms ?? '2 Bathrooms');
  const parking = parseParking(answers.car_parking ?? answers.parking ?? project.parking_count ?? hr.building?.parking ?? '1 Car');

  const flags = {
    hasPooja: answers.has_pooja === 'Yes' || answers.has_pooja === true || project.has_pooja === true,
    hasOffice: answers.has_office === 'Yes' || answers.has_office === true || project.has_office === true,
    hasTerrace: answers.has_terrace === 'Yes' || answers.has_terrace === true || project.has_terrace === true,
    parking,
  };

  const location = answers.location || project.location || hr.plot?.location?.city || '';
  const budgetRaw = answers.budget || project.budget || hr.budget?.amount || 0;


  const count = (key, fallback) => Math.max(0, Math.min(10, Number(answers[key] ?? answers.room_quantities?.[key] ?? fallback)));
  const rooms = [];
  function add(name, type, qty, sizeKey, lengthFt, widthFt) {
    for (let i = 0; i < qty; i++) {
      const area = Number(answers[sizeKey]);
      const scale = area >= 25 ? Math.sqrt(area / (lengthFt * widthFt)) : 1;
      rooms.push({ name: qty > 1 ? name+' '+(i+1) : name, type, storeyIndex: 0, lengthFt: lengthFt * scale, widthFt: widthFt * scale });
    }
  }
  add('Living Room','living',count('qty_living',1),'size_living',16,14);
  add('Kitchen','kitchen',count('qty_kitchen',1),'size_kitchen',12,10);
  add('Dining','dining',count('qty_dining',1),'size_dining',12,10);
  add('Master Bedroom','bedroom',Math.min(1,bedrooms),'size_master_bedroom',12,11);
  add('Bedroom','bedroom',Math.max(0,bedrooms-1),'size_bedroom_2',12,11);
  add('Bathroom','bathroom',bathrooms,'',8,6);
  add('Pooja Room','pooja',count('qty_pooja',flags.hasPooja?1:0),'size_pooja',6,6);
  add('Home Office','office',count('qty_study',flags.hasOffice?1:0),'size_study',10,9);
  add('Guest Room','guest',count('qty_guest',0),'',12,10);
  if(flags.hasTerrace) add('Terrace','terrace',1,'',14,12);
  add('Car Parking','parking',parking,'',18,10);
  add('Two Wheeler Parking','parking',Math.min(6,Number(answers.two_wheeler_parking)||0),'',6,3);
  for(const r of (Array.isArray(answers.custom_rooms)?answers.custom_rooms:[])) {
    const area=Number(r.size || r.area || r.area_sqft);
    add(String(r.name || r.label || 'Additional Room').replace(/[<>]/g,''),'other',Math.min(10,Number(r.quantity || r.qty || 1)),'',area>=25?Math.sqrt(area):10,area>=25?Math.sqrt(area):10);
  }
  rooms.filter(r=>r.type==='bedroom').forEach((r,i)=>r.storeyIndex=Math.min(floors-1,Math.floor(i/2)));
  rooms.filter(r=>r.type==='bathroom').forEach((r,i)=>r.storeyIndex=i%floors);
  rooms.filter(r=>['office','guest','terrace'].includes(r.type)).forEach(r=>r.storeyIndex=floors-1);

  return {
    schemaVersion: 1,
    projectName: project.project_name || 'My Home',
    description: project.description || answers.extras || '',
    site: {
      location,
      city: project.city || hr.plot?.location?.city || '',
      state: project.state || hr.plot?.location?.state || '',
      plotLengthFt,
      plotWidthFt,
      roadFacing: normalizeRoadFacing(land.road_facing || answers.road_facing || project.road_facing || 'East'),
      ...Object.fromEntries(['front','rear','left','right'].filter(side => (land['setback_'+side+'_ft'] ?? answers['setback_'+side+'_ft']) !== undefined).map(side => ['setback'+side[0].toUpperCase()+side.slice(1)+'Ft', Number(land['setback_'+side+'_ft'] ?? answers['setback_'+side+'_ft'])])),
    },
    building: {
      floors,
      bedrooms,
      bathrooms: Math.max(1, bathrooms),
      parking,
      architecturalStyle: answers.arch_style || project.architectural_style || 'Contemporary',
      qualityLevel: normalizeQualityLevel(answers.quality || project.quality_level || 'Standard'),
      budgetInr: Number(budgetRaw) || 0,
      hasPooja: flags.hasPooja,
      hasOffice: flags.hasOffice,
      hasTerrace: flags.hasTerrace,
      vastu: normalizeVastu(answers.vastu || project.vastu_preference || ''),
    },
    rooms,
    storeys: buildStoreys(floors),
  };
}

module.exports = { fromProject, buildStoreys, defaultRooms };
