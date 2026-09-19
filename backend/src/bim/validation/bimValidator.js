'use strict';

const GLOBAL_ID_SET = new Set();

function resetGlobalIds() {
  GLOBAL_ID_SET.clear();
}

function validate(model) {
  resetGlobalIds();
  const errors = [];
  const warnings = [];

  if (!model || !Array.isArray(model.elements)) {
    errors.push('BIM model has no elements array.');
    return { valid: false, errors, warnings };
  }

  const byId = new Map();
  for (const el of model.elements) {
    if (!el.id) errors.push('Element missing id.');
    if (!el.type) errors.push(`Element ${el.id || '?'} missing type.`);
    if (!el.globalId) {
      errors.push(`Element ${el.id} missing globalId.`);
    } else if (GLOBAL_ID_SET.has(el.globalId)) {
      errors.push(`Duplicate globalId: ${el.globalId}`);
    } else {
      GLOBAL_ID_SET.add(el.globalId);
    }
    if (el.id) {
      if (byId.has(el.id)) errors.push(`Duplicate element id: ${el.id}`);
      byId.set(el.id, el);
    }

    if (el.type === 'Wall') {
      const g = el.geometry || {};
      if (!g.startPoint || !g.endPoint) errors.push(`Wall ${el.id} missing start/end points.`);
      const len = el.dimensions?.lengthM ?? 0;
      const h = el.dimensions?.heightM ?? g.heightM ?? 0;
      const t = el.dimensions?.thicknessM ?? g.thicknessM ?? 0;
      if (len <= 0 || h <= 0 || t <= 0) errors.push(`Wall ${el.id} has non-positive dimensions.`);
    }

    if (el.type === 'Door' || el.type === 'Window') {
      const host = el.geometry?.hostWallId;
      if (!host) errors.push(`${el.type} ${el.id} must belong to a wall (hostWallId).`);
      else if (!byId.has(host) && !model.elements.find((e) => e.id === host)) {
        warnings.push(`${el.type} ${el.id} references wall ${host} — verify host exists after full parse.`);
      }
    }

    if (el.type === 'Room' && el.storeyId) {
      const storey = model.elements.find((e) => e.id === el.storeyId && e.type === 'BuildingStorey');
      if (!storey) warnings.push(`Room ${el.id} storey ${el.storeyId} not found in elements.`);
    }
  }

  for (const rel of model.relationships || []) {
    if (!rel.sourceId || !rel.targetId) errors.push('Relationship missing source or target.');
    if (rel.type === 'hosts') {
      const host = byId.get(rel.sourceId);
      const guest = byId.get(rel.targetId);
      if (host && guest && host.type !== 'Wall') {
        errors.push(`Door/Window ${rel.targetId} must be hosted by a Wall, not ${host.type}.`);
      }
    }
  }

  const doors = model.elements.filter((e) => e.type === 'Door');
  const windows = model.elements.filter((e) => e.type === 'Window');
  for (const d of doors) {
    const hostId = d.geometry?.hostWallId;
    const host = model.elements.find((e) => e.id === hostId);
    if (host && d.geometry?.positionOnWall > 1) {
      errors.push(`Door ${d.id} positionOnWall must be between 0 and 1.`);
    }
  }

  if (!model.elements.some((e) => e.type === 'BuildingStorey')) {
    errors.push('BIM model must contain at least one BuildingStorey.');
  }
  if (!model.elements.some((e) => e.type === 'Wall')) {
    warnings.push('BIM model has no walls yet.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validate };
