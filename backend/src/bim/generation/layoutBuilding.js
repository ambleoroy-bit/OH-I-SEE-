'use strict';

const {
  ft,
  PARTITION_M,
  getSetbacks,
  buildableRect,
  layoutStoreyRooms,
} = require('./spatialLayout');

/**
 * Build per-storey layouts with setbacks, plot boundary, and collision-safe packing.
 */
function layoutBuilding(requirements) {
  const plotL = requirements.site?.plotLengthM || ft(requirements.site?.plotLengthFt || 40);
  const plotW = requirements.site?.plotWidthM || ft(requirements.site?.plotWidthFt || 30);
  const setbacks = getSetbacks(requirements.site, plotL, plotW);
  const buildable = buildableRect(plotL, plotW, setbacks);

  const rooms = requirements.rooms || [];
  const storeyCount = Math.max(1, requirements.building?.floors || requirements.storeys?.length || 1);
  const byStorey = new Map();

  for (const room of rooms) {
    const idx = Math.min(storeyCount - 1, Math.max(0, room.storeyIndex || 0));
    if (!byStorey.has(idx)) byStorey.set(idx, []);
    byStorey.get(idx).push(room);
  }

  for (let i = 0; i < storeyCount; i++) {
    if (!byStorey.has(i)) {
      byStorey.set(i, [{
        name: `Floor ${i + 1} Hall`,
        type: 'living',
        storeyIndex: i,
        lengthFt: 14,
        widthFt: 12,
      }]);
    }
  }

  const storeyLayouts = [];
  let footprintL = 4;
  let footprintW = 4;
  let originX = buildable.x;
  let originY = buildable.y;
  let layoutError = null;
  let garden = null;

  for (let i = 0; i < storeyCount; i++) {
    const storeyRooms = byStorey.get(i) || [];
    const result = layoutStoreyRooms(storeyRooms, buildable, PARTITION_M);

    if (!result.ok) {
      layoutError = result.layoutError || result.error;
    }

    footprintL = Math.max(footprintL, result.buildL || 4);
    footprintW = Math.max(footprintW, result.buildW || 4);
    originX = result.originX ?? buildable.x;
    originY = result.originY ?? buildable.y;
    if (result.garden && i === 0) garden = result.garden;

    storeyLayouts.push({
      originX: result.originX, originY: result.originY,
      layoutWarning: result.layoutWarning,
      storeyIndex: i,
      rooms: result.rooms || [],
      buildingRooms: result.buildingRooms || [],
      parking: result.parking || [],
      buildL: result.buildL || footprintL,
      buildW: result.buildW || footprintW,
      ok: result.ok,
    });
  }

  return {
    originX,
    originY,
    buildL: footprintL,
    buildW: footprintW,
    plotL,
    plotW,
    setbacks,
    buildable,
    garden,
    layoutError,
    storeyLayouts,
  };
}

/**
 * Interior partition segments between packed rooms (axis-aligned).
 */
function partitionWallsForLayout(layout, storeyIndex, heightM, elevationM) {
  const walls = [];
  const rooms = (layout.buildingRooms || layout.rooms || []).filter((r) => r.type !== 'parking');
  const gap = PARTITION_M;

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];

      const aRight = a.x + a.lengthM;
      const bRight = b.x + b.lengthM;
      if (Math.abs(aRight - b.x) < gap + 0.05 || Math.abs(bRight - a.x) < gap + 0.05) {
        const x = Math.abs(aRight - b.x) < gap + 0.05 ? aRight : bRight;
        const y1 = Math.max(a.y, b.y);
        const y2 = Math.min(a.y + a.widthM, b.y + b.widthM);
        if (y2 - y1 > 0.5) {
          walls.push({
            id: `part-v-${storeyIndex}-${i}-${j}`,
            start: { x, y: y1 },
            end: { x, y: y2 },
            interior: true,
            storeyIndex,
            elevationM,
            heightM,
          });
        }
      }

      const aTop = a.y + a.widthM;
      const bTop = b.y + b.widthM;
      if (Math.abs(aTop - b.y) < gap + 0.05 || Math.abs(bTop - a.y) < gap + 0.05) {
        const y = Math.abs(aTop - b.y) < gap + 0.05 ? aTop : bTop;
        const x1 = Math.max(a.x, b.x);
        const x2 = Math.min(a.x + a.lengthM, b.x + b.lengthM);
        if (x2 - x1 > 0.5) {
          walls.push({
            id: `part-h-${storeyIndex}-${i}-${j}`,
            start: { x: x1, y },
            end: { x: x2, y },
            interior: true,
            storeyIndex,
            elevationM,
            heightM,
          });
        }
      }
    }
  }

  return walls;
}

function exteriorWalls(ox, oy, buildL, buildW, storeyIndex, elevationM, heightM) {
  return [
    { id: `ext-s-${storeyIndex}`, start: { x: ox, y: oy }, end: { x: ox + buildL, y: oy }, exterior: true, storeyIndex, elevationM, heightM },
    { id: `ext-e-${storeyIndex}`, start: { x: ox + buildL, y: oy }, end: { x: ox + buildL, y: oy + buildW }, exterior: true, storeyIndex, elevationM, heightM },
    { id: `ext-n-${storeyIndex}`, start: { x: ox + buildL, y: oy + buildW }, end: { x: ox, y: oy + buildW }, exterior: true, storeyIndex, elevationM, heightM },
    { id: `ext-w-${storeyIndex}`, start: { x: ox, y: oy + buildW }, end: { x: ox, y: oy }, exterior: true, storeyIndex, elevationM, heightM },
  ];
}

module.exports = {
  ft,
  layoutBuilding,
  partitionWallsForLayout,
  exteriorWalls,
};
