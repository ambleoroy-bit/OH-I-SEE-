'use strict';

const { boxesOverlap, PARTITION_M } = require('../generation/spatialLayout');

function roomBox(room) {
  return {
    x: room.position?.x ?? room.x ?? 0,
    y: room.position?.y ?? room.y ?? 0,
    lengthM: room.dimensions?.lengthM ?? room.lengthM ?? 0,
    widthM: room.dimensions?.widthM ?? room.widthM ?? 0,
    name: room.name || room.id,
    type: room.type,
    id: room.id,
    storeyId: room.storeyId ?? null,
    zone: room.properties?.zone || room.properties?.roomType || room.type,
  };
}

function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Validate building layout against plot boundary and internal collisions.
 */
function validateBuildingWithinPlot(model, layoutMeta = {}) {
  const errors = [];
  const warnings = [];
  const elements = model?.elements || [];

  const siteEl = elements.find((e) => e.geometry?.kind === 'plot');
  const plotL = siteEl?.dimensions?.lengthM ?? layoutMeta.plotL ?? model.site?.plotLengthM;
  const plotW = siteEl?.dimensions?.widthM ?? layoutMeta.plotW ?? model.site?.plotWidthM;

  if (!plotL || !plotW) {
    warnings.push('Plot dimensions not found; spatial plot validation skipped.');
    return { valid: true, errors, warnings };
  }

  const setbacks = layoutMeta.setbacks || {};
  const buildable = layoutMeta.buildable || {
    x: setbacks.left || 0,
    y: setbacks.front || 0,
    width: plotL - (setbacks.left || 0) - (setbacks.right || 0),
    height: plotW - (setbacks.front || 0) - (setbacks.rear || 0),
  };

  const rooms = elements.filter((e) => e.type === 'Room');
  const walls = elements.filter((e) => e.type === 'Wall');
  const doors = elements.filter((e) => e.type === 'Door');
  const windows = elements.filter((e) => e.type === 'Window');

  const roomBoxes = rooms.map(roomBox);

  for (let i = 0; i < roomBoxes.length; i++) {
    const a = roomBoxes[i];
    if (a.x < 0 || a.y < 0 || a.x + a.lengthM > plotL || a.y + a.widthM > plotW) {
      errors.push(`Room "${a.name}" extends outside the plot boundary.`);
    }

    for (let j = i + 1; j < roomBoxes.length; j++) {
      const b = roomBoxes[j];
      const aZone = a.zone === 'parking' || a.zone === 'garden' || /garden|landscape/i.test(a.name || '');
      const bZone = b.zone === 'parking' || b.zone === 'garden' || /garden|landscape/i.test(b.name || '');
      if (aZone || bZone) continue;
      if (a.storeyId && b.storeyId && a.storeyId !== b.storeyId) continue;
      if (boxesOverlap(a, b, PARTITION_M * 0.25)) {
        errors.push(`Room "${a.name}" overlaps "${b.name}".`);
      }
    }
  }

  for (const wall of walls) {
    const sp = wall.geometry?.startPoint;
    const ep = wall.geometry?.endPoint;
    if (!sp || !ep) continue;
    const t = (wall.dimensions?.thicknessM || 0.23) / 2;
    const pts = [sp, ep];
    for (const p of pts) {
      if (!pointInRect(p.x, p.y, -t, -t, plotL + t * 2, plotW + t * 2)) {
        errors.push(`Wall "${wall.name || wall.id}" crosses plot boundary.`);
        break;
      }
    }
  }

  const wallById = new Map(walls.map((w) => [w.id, w]));
  for (const door of doors) {
    const host = wallById.get(door.geometry?.hostWallId);
    if (!host) {
      errors.push(`Door "${door.name || door.id}" is not attached to a wall.`);
    }
    const pos = door.position || {};
    if (!pointInRect(pos.x, pos.y, 0, 0, plotL, plotW)) {
      errors.push(`Door "${door.name || door.id}" is outside the plot.`);
    }
  }

  for (const win of windows) {
    const host = wallById.get(win.geometry?.hostWallId);
    if (!host) {
      errors.push(`Window "${win.name || win.id}" is not attached to a wall.`);
    }
  }

  const buildingEl = elements.find((e) => e.type === 'Building');
  if (buildingEl) {
    const ox = buildingEl.position?.x ?? 0;
    const oy = buildingEl.position?.y ?? 0;
    const bl = buildingEl.dimensions?.lengthM ?? 0;
    const bw = buildingEl.dimensions?.widthM ?? 0;
    for (const rb of roomBoxes.filter((r) => r.type !== 'parking')) {
      if (rb.x < ox - 0.1 || rb.y < oy - 0.1
        || rb.x + rb.lengthM > ox + bl + 0.1
        || rb.y + rb.widthM > oy + bw + 0.1) {
        warnings.push(`Room "${rb.name}" extends outside the declared building footprint.`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateBuildingWithinPlot, roomBox, boxesOverlap };
