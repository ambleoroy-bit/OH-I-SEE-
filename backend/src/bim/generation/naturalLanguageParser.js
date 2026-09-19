'use strict';

/**
 * Deterministic natural-language design prompt parser.
 * Extracts structured patches from user text — no external AI.
 */

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * @param {string} prompt
 * @returns {Object} parsed fields
 */
function parseDesignPrompt(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  const out = {
    plotLengthFt: null,
    plotWidthFt: null,
    floors: null,
    bedrooms: null,
    bathrooms: null,
    bhk: null,
    hasPooja: null,
    hasOffice: null,
    hasTerrace: null,
    parking: null,
    hasBalcony: null,
    roadFacing: null,
    architecturalStyle: null,
    qualityLevel: null,
    vastu: null,
    addBedroom: false,
    addBathroom: false,
    addFloor: false,
    enlargeKitchen: false,
    enlargeLiving: false,
    moveKitchenNearDining: false,
    northFacing: false,
    raw: p,
  };

  const plotMatch = p.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (plotMatch) {
    out.plotLengthFt = Math.max(10, parseInt(plotMatch[1], 10));
    out.plotWidthFt = Math.max(10, parseInt(plotMatch[2], 10));
  }

  const bhk = p.match(/(\d+)\s*bhk/);
  if (bhk) out.bhk = parseInt(bhk[1], 10);

  const bedNum = p.match(/(\d+)\s*(?:bed(?:room)?s?)/);
  if (bedNum) out.bedrooms = parseInt(bedNum[1], 10);
  else if ((/add|extra|another|more/.test(p) && /bed/.test(p)) || p === 'add bedroom') out.addBedroom = true;

  const bathNum = p.match(/(\d+)\s*bath(?:room)?s?/);
  if (bathNum) out.bathrooms = parseInt(bathNum[1], 10);
  else if (/add|extra|another|more/.test(p) && /bath/.test(p)) out.addBathroom = true;

  if (/g\s*\+\s*3|three\s*floor|3\s*floor/.test(p)) out.floors = 4;
  else if (/g\s*\+\s*2|three\s*storey|3\s*storey/.test(p)) out.floors = 3;
  else if (/g\s*\+\s*1|two\s*floor|2\s*floor|double\s*floor/.test(p)) out.floors = 2;
  else if (/single\s*floor|ground\s*only|one\s*floor|ground\s*floor\s*only/.test(p)) out.floors = 1;
  else if (/add|extra|another/.test(p) && /floor|storey|story/.test(p)) out.addFloor = true;

  if (/pooja|puja|prayer/.test(p)) out.hasPooja = true;
  if (/office|study|work\s*from\s*home/.test(p)) out.hasOffice = true;
  if (/terrace|rooftop|roof\s*garden/.test(p)) out.hasTerrace = true;
  if (/balcony/.test(p)) out.hasBalcony = true;

  const parkMatch = p.match(/(\d+)\s*car/);
  if (/garage|car\s*park|parking/.test(p)) {
    out.parking = parkMatch ? parseInt(parkMatch[1], 10) : 1;
  }

  if (/north[\s-]?facing/.test(p)) { out.roadFacing = 'North'; out.northFacing = true; }
  else if (/south[\s-]?facing/.test(p)) out.roadFacing = 'South';
  else if (/east[\s-]?facing/.test(p)) out.roadFacing = 'East';
  else if (/west[\s-]?facing/.test(p)) out.roadFacing = 'West';

  if (/kitchen/.test(p) && /bigger|larger|expand/.test(p)) out.enlargeKitchen = true;
  if (/living/.test(p) && /bigger|larger|expand/.test(p)) out.enlargeLiving = true;
  if (/move\s+kitchen/.test(p) && /dining|next/.test(p)) out.moveKitchenNearDining = true;

  if (/modern|contemporary|minimal/.test(p)) out.architecturalStyle = 'Contemporary';
  else if (/traditional|classic|kerala|villa/.test(p)) out.architecturalStyle = 'Traditional';

  if (/premium|luxury|high[\s-]?end/.test(p)) out.qualityLevel = 'Premium';
  else if (/economic|budget|affordable/.test(p)) out.qualityLevel = 'Economic';

  if (/vastu/.test(p)) {
    out.vastu = /no|without|ignore/.test(p) ? 'No' : (/part|partial/.test(p) ? 'Partly' : 'Yes');
  }

  return out;
}

/**
 * Merge parsed NL fields into building requirements.
 * @param {Object} requirements
 * @param {string} prompt
 * @returns {{ requirements: Object, changes: string[], summary: string }}
 */
function mergePromptIntoRequirements(requirements, prompt) {
  const req = clone(requirements);
  const parsed = parseDesignPrompt(prompt);
  const changes = [];

  if (!parsed.raw) {
    return { requirements: req, changes: [], summary: 'No changes applied.' };
  }

  if (parsed.plotLengthFt) {
    req.site.plotLengthFt = parsed.plotLengthFt;
    req.site.plotWidthFt = parsed.plotWidthFt;
    changes.push(`Plot ${parsed.plotLengthFt}×${parsed.plotWidthFt} ft`);
  }

  if (parsed.bhk) {
    req.building.bedrooms = Math.max(1, parsed.bhk);
    changes.push(`${parsed.bhk} BHK (${req.building.bedrooms} bedrooms)`);
  }
  if (parsed.bedrooms != null) {
    req.building.bedrooms = Math.min(10, parsed.bedrooms);
    changes.push(`${req.building.bedrooms} bedrooms`);
  } else if (parsed.addBedroom) {
    req.building.bedrooms = Math.min(10, (req.building.bedrooms || 3) + 1);
    changes.push(`Added bedroom (now ${req.building.bedrooms})`);
  }

  if (parsed.bathrooms != null) {
    req.building.bathrooms = Math.min(10, parsed.bathrooms);
    changes.push(`${req.building.bathrooms} bathrooms`);
  } else if (parsed.addBathroom) {
    req.building.bathrooms = Math.min(10, (req.building.bathrooms || 2) + 1);
    changes.push(`Added bathroom (now ${req.building.bathrooms})`);
  }

  if (parsed.floors != null) {
    req.building.floors = parsed.floors;
    changes.push(`${parsed.floors} floor(s)`);
  } else if (parsed.addFloor) {
    req.building.floors = Math.min(4, (req.building.floors || 1) + 1);
    changes.push(`Added floor (now ${req.building.floors})`);
  }

  if (parsed.hasPooja) { req.building.hasPooja = true; changes.push('Pooja room'); }
  if (parsed.hasOffice) { req.building.hasOffice = true; changes.push('Home office'); }
  if (parsed.hasTerrace) { req.building.hasTerrace = true; changes.push('Terrace'); }
  if (parsed.hasBalcony) changes.push('Balcony');
  if (parsed.parking != null) {
    req.building.parking = parsed.parking;
    changes.push(`Parking for ${parsed.parking} car(s)`);
  }
  if (parsed.roadFacing) {
    req.site.roadFacing = parsed.roadFacing;
    changes.push(`Road facing ${parsed.roadFacing}`);
  }
  if (parsed.architecturalStyle) {
    req.building.architecturalStyle = parsed.architecturalStyle;
    changes.push(`Style → ${parsed.architecturalStyle}`);
  }
  if (parsed.qualityLevel) {
    req.building.qualityLevel = parsed.qualityLevel;
    changes.push(`Quality → ${parsed.qualityLevel}`);
  }
  if (parsed.vastu) {
    req.building.vastu = parsed.vastu;
    changes.push(`Vastu → ${parsed.vastu}`);
  }

  const rooms = req.rooms || [];
  const ensureRoom = (name, type, lengthFt, widthFt, storeyIndex = 0) => {
    if (rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    rooms.push({ name, type, storeyIndex, lengthFt, widthFt });
    changes.push(`Added ${name}`);
  };

  if (parsed.hasPooja) ensureRoom('Pooja Room', 'pooja', 6, 6);
  if (parsed.hasOffice) ensureRoom('Home Office', 'office', 10, 9);
  if (parsed.hasTerrace) ensureRoom('Terrace', 'terrace', 14, 12, 1);
  if (parsed.hasBalcony) ensureRoom('Balcony', 'balcony', 8, 4, 1);
  if (parsed.parking) ensureRoom('Car Parking', 'parking', 18, 10);

  if (parsed.enlargeKitchen) {
    const kitchen = rooms.find((r) => r.type === 'kitchen');
    if (kitchen) {
      kitchen.lengthFt = (kitchen.lengthFt || 12) + 2;
      kitchen.widthFt = (kitchen.widthFt || 10) + 2;
      changes.push('Enlarged kitchen');
    }
  }
  if (parsed.enlargeLiving) {
    const living = rooms.find((r) => r.type === 'living');
    if (living) {
      living.lengthFt = (living.lengthFt || 16) + 3;
      living.widthFt = (living.widthFt || 14) + 2;
      changes.push('Enlarged living room');
    }
  }
  if (parsed.moveKitchenNearDining) {
    const kitchen = rooms.find((r) => r.type === 'kitchen');
    const dining = rooms.find((r) => r.type === 'dining');
    if (kitchen && dining) {
      kitchen.storeyIndex = dining.storeyIndex;
      changes.push('Kitchen repositioned next to dining');
    }
  }

  req.rooms = rooms;

  const countChanged = parsed.bedrooms != null || parsed.bathrooms != null || parsed.bhk != null
    || parsed.addBedroom || parsed.addBathroom || parsed.hasPooja || parsed.hasOffice
    || parsed.hasTerrace || parsed.parking != null;

  if (countChanged) {
    const { defaultRooms } = require('./requirementsParser');
    const defaults = defaultRooms(
      req.building.bedrooms || 3,
      req.building.bathrooms || 2,
      {
        hasPooja: !!req.building.hasPooja,
        hasOffice: !!req.building.hasOffice,
        hasTerrace: !!req.building.hasTerrace,
        parking: req.building.parking || 0,
      }
    );
    const standardTypes = new Set([
      'living', 'dining', 'kitchen', 'bedroom', 'bathroom', 'pooja', 'office', 'parking', 'terrace', 'balcony',
    ]);
    const custom = rooms.filter((r) => {
      if (standardTypes.has(r.type)) return false;
      return !defaults.some((d) => d.type === r.type && d.name === r.name);
    });
    req.rooms = [...defaults, ...custom];
  }

  const count = Math.min(4, Math.max(1, req.building.floors || 1));
  const names = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];
  req.storeys = [];
  for (let i = 0; i < count; i++) {
    req.storeys.push({
      index: i,
      name: names[i] || `Floor ${i}`,
      elevationM: i * 3.0,
      clearHeightM: 3.0,
    });
  }

  const summary = changes.length
    ? `Applied: ${changes.join('; ')}`
    : 'No matching design changes — try e.g. "30x40 plot, 2BHK, add terrace"';

  return { requirements: req, changes, summary, prompt: parsed.raw };
}

module.exports = { parseDesignPrompt, mergePromptIntoRequirements };
