'use strict';

function rectsOverlap(a, b, gap = 0.05) {
  return !(
    a.x + a.widthM <= b.x + gap
    || b.x + b.widthM <= a.x + gap
    || a.y + a.depthM <= b.y + gap
    || b.y + b.depthM <= a.y + gap
  );
}

function pointOnSegment(p, start, end, tol = 0.15) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.01) return Math.hypot(p.x - start.x, p.y - start.y) < tol;
  const t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / len2;
  if (t < -0.05 || t > 1.05) return false;
  const px = start.x + t * dx;
  const py = start.y + t * dy;
  return Math.hypot(p.x - px, p.y - py) < tol;
}

/**
 * Validate canonical house model before BIM / 3D generation.
 * @param {import('../core/houseModel').HouseModel|Object} house
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateHouseModel(house) {
  const errors = [];
  const warnings = [];

  if (!house?.plot?.widthM || !house?.plot?.depthM) {
    errors.push('Plot dimensions are missing.');
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(house.floors) || house.floors.length === 0) {
    errors.push('At least one floor is required.');
    return { valid: false, errors, warnings };
  }

  const plotW = house.plot.widthM;
  const plotD = house.plot.depthM;
  const buildable = house.plot.buildable;

  for (const floor of house.floors) {
    const fp = floor.footprint;
    if (!fp) {
      errors.push(`Floor ${floor.level} has no footprint.`);
      continue;
    }

    if (fp.x < -0.01 || fp.y < -0.01 || fp.x + fp.widthM > plotW + 0.05 || fp.y + fp.depthM > plotD + 0.05) {
      errors.push(`Floor ${floor.name} footprint exceeds the plot boundary.`);
    }

    if (buildable) {
      if (fp.x < buildable.x - 0.05 || fp.y < buildable.y - 0.05
        || fp.x + fp.widthM > buildable.x + buildable.width + 0.05
        || fp.y + fp.depthM > buildable.y + buildable.height + 0.05) {
        errors.push(`Floor ${floor.name} exceeds the buildable area after setbacks.`);
      }
    }

    const buildingRooms = floor.rooms.filter((r) => {
      if (r.type === 'parking' || r.type === 'garden' || r.zone === 'parking') return false;
      return true;
    });

    for (let i = 0; i < buildingRooms.length; i++) {
      for (let j = i + 1; j < buildingRooms.length; j++) {
        if (rectsOverlap(buildingRooms[i], buildingRooms[j])) {
          errors.push(`Rooms "${buildingRooms[i].name}" and "${buildingRooms[j].name}" overlap on ${floor.name}.`);
        }
      }
    }

    for (const room of buildingRooms) {
      if (room.widthM < 1.5 || room.depthM < 1.5) {
        warnings.push(`Room "${room.name}" is very small (${room.widthM.toFixed(1)}×${room.depthM.toFixed(1)} m).`);
      }
      if (room.type === 'bathroom' && (room.widthM < 1.2 || room.depthM < 1.2)) {
        errors.push(`Bathroom "${room.name}" is too small for fixtures.`);
      }
      const rx = room.x;
      const ry = room.y;
      if (rx < fp.x - 0.05 || ry < fp.y - 0.05
        || rx + room.widthM > fp.x + fp.widthM + 0.05
        || ry + room.depthM > fp.y + fp.depthM + 0.05) {
        errors.push(`Room "${room.name}" is outside the building footprint on ${floor.name}.`);
      }
    }

    const wallMap = new Map(floor.walls.map((w) => [w.id, w]));

    for (const door of floor.doors || []) {
      const wall = wallMap.get(door.wallId);
      if (!wall) {
        errors.push(`Door ${door.id} references missing wall ${door.wallId}.`);
        continue;
      }
      const mid = {
        x: wall.start.x + (wall.end.x - wall.start.x) * door.positionOnWall,
        y: wall.start.y + (wall.end.y - wall.start.y) * door.positionOnWall,
      };
      if (!pointOnSegment(mid, wall.start, wall.end)) {
        errors.push(`Door ${door.id} is not positioned on wall ${door.wallId}.`);
      }
    }

    for (const win of floor.windows || []) {
      const wall = wallMap.get(win.wallId);
      if (!wall) {
        errors.push(`Window ${win.id} references missing wall ${win.wallId}.`);
      }
    }

    if (Math.abs(floor.elevationM - floor.level * 3.0) > 0.01 && floor.level > 0) {
      const prev = house.floors.find((f) => f.level === floor.level - 1);
      if (prev && Math.abs(floor.elevationM - (prev.elevationM + prev.clearHeightM)) > 0.05) {
        errors.push(`Floor ${floor.name} elevation does not align with the floor below.`);
      }
    }
  }

  for (const park of house.parking || []) {
    if (park.x < 0 || park.y < 0 || park.x + park.widthM > plotW || park.y + park.depthM > plotD) {
      errors.push('Parking zone exceeds the plot boundary.');
    }
  }

  if (house.garden) {
    const g = house.garden;
    if (g.x < 0 || g.y < 0 || g.x + g.widthM > plotW || g.y + g.depthM > plotD) {
      errors.push('Garden zone exceeds the plot boundary.');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateHouseModel };
