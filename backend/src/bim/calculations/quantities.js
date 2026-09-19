'use strict';

/**
 * Quantity takeoff from BIM model elements.
 */
function calculateQuantities(model) {
  const lines = [];
  const byMaterial = new Map();

  for (const el of model.elements || []) {
    if (el.type === 'Wall' && el.quantity?.volumeM3) {
      lines.push({
        elementId: el.id,
        elementType: 'Wall',
        name: el.name,
        measureType: 'volume',
        value: el.quantity.volumeM3,
        unit: 'm3',
        materialId: el.materialId,
        description: `Wall masonry — ${el.name}`,
      });
      accumulateMaterial(byMaterial, el.materialId, 'volume', el.quantity.volumeM3, 'm3');
    }
    if (el.type === 'Slab' && el.quantity?.volumeM3) {
      lines.push({
        elementId: el.id,
        elementType: 'Slab',
        name: el.name,
        measureType: 'volume',
        value: el.quantity.volumeM3,
        unit: 'm3',
        materialId: el.materialId || 'MAT-CONCRETE',
        description: `Slab concrete — ${el.name}`,
      });
      accumulateMaterial(byMaterial, el.materialId || 'MAT-CONCRETE', 'volume', el.quantity.volumeM3, 'm3');
    }
    if (el.type === 'Room' && el.quantity?.areaM2) {
      lines.push({
        elementId: el.id,
        elementType: 'Room',
        name: el.name,
        measureType: 'area',
        value: el.quantity.areaM2,
        unit: 'm2',
        materialId: null,
        description: `Floor area — ${el.name}`,
      });
    }
    if (el.type === 'Door') {
      lines.push({
        elementId: el.id,
        elementType: 'Door',
        name: el.name,
        measureType: 'count',
        value: 1,
        unit: 'ea',
        materialId: el.materialId,
        description: `Door — ${el.name}`,
      });
    }
    if (el.type === 'Window') {
      lines.push({
        elementId: el.id,
        elementType: 'Window',
        name: el.name,
        measureType: 'count',
        value: 1,
        unit: 'ea',
        materialId: el.materialId,
        description: `Window — ${el.name}`,
      });
    }
  }

  const materialSummary = [...byMaterial.entries()].map(([materialId, data]) => ({
    materialId,
    ...data,
  }));

  return { lines, materialSummary, generatedAt: new Date().toISOString() };
}

function accumulateMaterial(map, materialId, measureType, value, unit) {
  const key = materialId || 'UNASSIGNED';
  if (!map.has(key)) map.set(key, { measureType, value: 0, unit });
  const row = map.get(key);
  row.value = Math.round((row.value + value) * 1000) / 1000;
}

module.exports = { calculateQuantities };
