'use strict';

const FT = 0.3048;
const PARTITION_M = 0.12;

function ft(n) {
  return Math.round(Number(n || 0) * FT * 1000) / 1000;
}

function roomAreaM2(room) {
  return ft(room.lengthFt || 10) * ft(room.widthFt || 10);
}

function getSetbacks(site, plotL, plotW) {
  const s = site?.setbacks || {};
  const defaults = {
    front: Math.min(ft(10), (plotW || 12) * 0.12),
    rear: Math.min(ft(5), (plotW || 12) * 0.08),
    left: Math.min(ft(5), (plotL || 15) * 0.08),
    right: Math.min(ft(5), (plotL || 15) * 0.08),
  };
  const raw = {
    front: s.frontFt ?? site.setbackFrontFt,
    rear: s.rearFt ?? site.setbackRearFt,
    left: s.leftFt ?? site.setbackLeftFt,
    right: s.rightFt ?? site.setbackRightFt,
  };
  return {
    front: raw.front != null ? ft(raw.front) : defaults.front,
    rear: raw.rear != null ? ft(raw.rear) : defaults.rear,
    left: raw.left != null ? ft(raw.left) : defaults.left,
    right: raw.right != null ? ft(raw.right) : defaults.right,
  };
}

function buildableRect(plotL, plotW, setbacks) {
  const x = setbacks.left;
  const y = setbacks.front;
  const width = Math.max(3, plotL - setbacks.left - setbacks.right);
  const height = Math.max(3, plotW - setbacks.front - setbacks.rear);
  return { x, y, width, height };
}

function boxesOverlap(a, b, gap = 0) {
  return (
    a.x < b.x + b.lengthM + gap
    && a.x + a.lengthM + gap > b.x
    && a.y < b.y + b.widthM + gap
    && a.y + a.widthM + gap > b.y
  );
}

function roomSortPriority(room) {
  const order = {
    living: 10, dining: 20, kitchen: 30,
    bedroom: 40, bathroom: 50, pooja: 60, office: 70,
    terrace: 80, balcony: 85, other: 90,
  };
  const base = order[room.type] ?? order.other;
  const area = roomAreaM2(room);
  return base * 1000 - area;
}

function sortRoomsForLayout(rooms) {
  return [...rooms].sort((a, b) => roomSortPriority(a) - roomSortPriority(b));
}

/**
 * Shelf-pack rooms into a rectangle. Uses the longer buildable axis for room rows.
 * @returns {{ rooms, buildL, buildW, originX, originY, ok, error? }}
 */
function packRoomsIntoRect(rooms, rect, partition = PARTITION_M) {
  if (!rooms.length) {
    return { rooms: [], buildL: 4, buildW: 4, originX: rect.x, originY: rect.y, ok: true };
  }

  const horizontal = rect.width >= rect.height;
  const sorted = sortRoomsForLayout(rooms);
  const positioned = [];

  if (horizontal) {
    let cursorX = rect.x;
    let cursorY = rect.y;
    let shelfHeight = 0;
    let shelfStartY = rect.y;

    for (const room of sorted) {
      const lengthM = Math.max(2.0, ft(room.lengthFt || 10));
      const widthM = Math.max(2.0, ft(room.widthFt || 10));

      if (cursorX > rect.x && cursorX + lengthM > rect.x + rect.width) {
        cursorX = rect.x;
        cursorY = shelfStartY + shelfHeight + partition;
        shelfHeight = 0;
        shelfStartY = cursorY;
      }

      if (cursorY + widthM > rect.y + rect.height) {
        return {
          ok: false,
          error: `Room "${room.name}" does not fit in buildable area.`,
          rooms: positioned,
          buildL: 0,
          buildW: 0,
          originX: rect.x,
          originY: rect.y,
        };
      }

      const placed = {
        ...room,
        x: cursorX,
        y: cursorY,
        lengthM,
        widthM,
        rotation: 0,
      };

      for (const other of positioned) {
        if (boxesOverlap(placed, other, partition * 0.5)) {
          return {
            ok: false,
            error: `Room "${room.name}" overlaps "${other.name}".`,
            rooms: positioned,
            buildL: 0,
            buildW: 0,
            originX: rect.x,
            originY: rect.y,
          };
        }
      }

      positioned.push(placed);
      cursorX += lengthM + partition;
      shelfHeight = Math.max(shelfHeight, widthM);
    }
  } else {
    // Tall buildable area — pack rows along X, rooms extend in Y
    let cursorY = rect.y;
    let cursorX = rect.x;
    let shelfWidth = 0;
    let shelfStartX = rect.x;

    for (const room of sorted) {
      const lengthM = Math.max(2.0, ft(room.lengthFt || 10));
      const widthM = Math.max(2.0, ft(room.widthFt || 10));

      if (cursorY > rect.y && cursorY + lengthM > rect.y + rect.height) {
        cursorY = rect.y;
        cursorX = shelfStartX + shelfWidth + partition;
        shelfWidth = 0;
        shelfStartX = cursorX;
      }

      if (cursorX + widthM > rect.x + rect.width) {
        return {
          ok: false,
          error: `Room "${room.name}" does not fit in buildable area.`,
          rooms: positioned,
          buildL: 0,
          buildW: 0,
          originX: rect.x,
          originY: rect.y,
        };
      }

      const placed = {
        ...room,
        x: cursorX,
        y: cursorY,
        lengthM: widthM,
        widthM: lengthM,
        rotation: 90,
      };

      for (const other of positioned) {
        if (boxesOverlap(placed, other, partition * 0.5)) {
          return {
            ok: false,
            error: `Room "${room.name}" overlaps "${other.name}".`,
            rooms: positioned,
            buildL: 0,
            buildW: 0,
            originX: rect.x,
            originY: rect.y,
          };
        }
      }

      positioned.push(placed);
      cursorY += lengthM + partition;
      shelfWidth = Math.max(shelfWidth, widthM);
    }
  }

  let maxX = rect.x;
  let maxY = rect.y;
  for (const r of positioned) {
    maxX = Math.max(maxX, r.x + r.lengthM);
    maxY = Math.max(maxY, r.y + r.widthM);
  }

  return {
    ok: true,
    rooms: positioned,
    buildL: Math.max(4, maxX - rect.x),
    buildW: Math.max(4, maxY - rect.y),
    originX: rect.x,
    originY: rect.y,
  };
}

function scaleRooms(rooms, factor) {
  return rooms.map((r) => ({
    ...r,
    lengthFt: Math.max(5, Math.round((r.lengthFt || 10) * factor * 10) / 10),
    widthFt: Math.max(4, Math.round((r.widthFt || 10) * factor * 10) / 10),
  }));
}

function separateSiteRooms(rooms) {
  const building = [];
  const parking = [];
  const garden = [];
  for (const r of rooms) {
    if (r.type === 'parking') parking.push(r);
    else if (r.type === 'garden' || r.type === 'landscape') garden.push(r);
    else building.push(r);
  }
  return { building, parking, garden };
}

/**
 * Place parking in buildable area outside building footprint (prefer front-left).
 */
function placeParking(parkingRooms, buildable, buildingFootprint, partition = PARTITION_M) {
  const placed = [];
  if (!parkingRooms.length) return { parking: placed, gardenRect: null };

  const bf = buildingFootprint;
  let px = buildable.x;
  let py = buildable.y + bf.buildW + partition;

  if (py + ft(parkingRooms[0].widthFt || 10) > buildable.y + buildable.height) {
    px = buildable.x + bf.buildL + partition;
    py = buildable.y;
  }

  for (const room of parkingRooms) {
    const lengthM = Math.max(0.6, ft(room.lengthFt || 18));
    const widthM = Math.max(0.6, ft(room.widthFt || 10));
    if (px + lengthM > buildable.x + buildable.width || py + widthM > buildable.y + buildable.height) {
      break;
    }
    placed.push({ ...room, x: px, y: py, lengthM, widthM, rotation: 0, zone: 'parking' });
    px += lengthM + partition;
  }

  const gardenRect = {
    x: buildable.x,
    y: buildable.y,
    width: buildable.width,
    height: buildable.height,
    buildingOx: bf.originX,
    buildingOy: bf.originY,
    buildingL: bf.buildL,
    buildingW: bf.buildW,
    parkingRects: placed,
  };

  return { parking: placed, gardenRect };
}

function buildingBoundsFromRooms(rooms) {
  if (!rooms?.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.lengthM);
    maxY = Math.max(maxY, r.y + r.widthM);
  }
  return { minX, minY, maxX, maxY };
}

function computeGardenBoundary(gardenRect, buildingRooms = []) {
  if (!gardenRect) return null;
  const { x, y, width, height, parkingRects } = gardenRect;
  const bb = buildingBoundsFromRooms(buildingRooms) || {
    minX: gardenRect.buildingOx,
    minY: gardenRect.buildingOy,
    maxX: gardenRect.buildingOx + gardenRect.buildingL,
    maxY: gardenRect.buildingOy + gardenRect.buildingW,
  };

  const pad = PARTITION_M;
  const candidates = [];

  if (bb.maxY + pad < y + height) {
    candidates.push({
      x, y: bb.maxY + pad, width, height: y + height - bb.maxY - pad,
      name: 'Garden',
    });
  }
  if (bb.maxX + pad < x + width) {
    candidates.push({
      x: bb.maxX + pad, y, width: x + width - bb.maxX - pad, height,
      name: 'Garden',
    });
  }
  if (bb.minX - pad > x) {
    candidates.push({
      x, y, width: bb.minX - x - pad, height,
      name: 'Garden',
    });
  }

  let best = null;
  let bestArea = 0;
  for (const c of candidates) {
    if (c.width < 2.5 || c.height < 2.5) continue;
    const box = { x: c.x, y: c.y, lengthM: c.width, widthM: c.height };
    let blocked = false;
    for (const p of parkingRects || []) {
      if (boxesOverlap(box, p, 0)) blocked = true;
    }
    for (const r of buildingRooms) {
      if (boxesOverlap(box, r, 0)) blocked = true;
    }
    if (blocked) continue;
    const area = c.width * c.height;
    if (area > bestArea) { bestArea = area; best = c; }
  }

  return best;
}

/**
 * Main spatial layout for one storey.
 */
function layoutStoreyRooms(rooms, buildable, partition = PARTITION_M) {
  const { building, parking } = separateSiteRooms(rooms);
  let buildingRooms = building;
  let packRect = { ...buildable };
  let parkingStrip = null;

  if (parking.length) {
    const parkDepth = Math.max(...parking.map((r) => ft(r.widthFt || 10)));
    const parkLength = parking.reduce((sum, r) => sum + ft(r.lengthFt || 18), 0) + Math.max(0,parking.length-1)*partition;
    const reserveDepth = parkDepth + partition;
    if (reserveDepth < buildable.height * 0.45 && parkLength <= buildable.width) {
      parkingStrip = {
        x: buildable.x,
        y: buildable.y,
        width: buildable.width,
        depth: reserveDepth,
      };
      packRect = {
        ...buildable,
        y: buildable.y + reserveDepth,
        height: Math.max(3, buildable.height - reserveDepth),
      };
    }
  }

  let pack = packRoomsIntoRect(buildingRooms, packRect, partition);
  let layoutWarning = null;

  const tryScalePack = (targetRect) => {
    const totalArea = building.reduce((s, r) => s + roomAreaM2(r), 0);
    const target = targetRect.width * targetRect.height * 0.78;
    let factor = totalArea > 0 ? Math.sqrt(target / totalArea) * 0.9 : 0.75;
    let scaledRooms = buildingRooms;
    let result = pack;
    for (let attempt = 0; attempt < 6 && !result.ok && factor >= 0.48; attempt++) {
      scaledRooms = scaleRooms(building, factor);
      result = packRoomsIntoRect(scaledRooms, targetRect, partition);
      if (result.ok) {
        layoutWarning = `Room dimensions scaled to ${Math.round(factor * 100)}% to fit the plot.`;
        buildingRooms = scaledRooms;
        break;
      }
      factor *= 0.88;
    }
    return result;
  };

  if (!pack.ok) {
    pack = tryScalePack(packRect);
  }

  if (!pack.ok && parkingStrip) {
    parkingStrip = null;
    packRect = { ...buildable };
    buildingRooms = building;
    pack = packRoomsIntoRect(buildingRooms, packRect, partition);
    if (!pack.ok) pack = tryScalePack(packRect);
  }

  if (!pack.ok) {
    return { ...pack, parking: [], garden: null, layoutError: pack.error };
  }

  const footprint = {
    originX: pack.originX,
    originY: pack.originY,
    buildL: pack.buildL,
    buildW: pack.buildW,
  };

  let parkingPlaced = [];
  let gardenRect = null;
  if (parkingStrip && parking.length) {
    let px = parkingStrip.x;
    for (const room of parking) {
      const lengthM = Math.max(0.6, ft(room.lengthFt || 18));
      const widthM = Math.min(parkingStrip.depth - partition, Math.max(0.6, ft(room.widthFt || 10)));
      if (px + lengthM > parkingStrip.x + parkingStrip.width) break;
      parkingPlaced.push({
        ...room,
        x: px,
        y: parkingStrip.y,
        lengthM,
        widthM,
        rotation: 0,
        zone: 'parking',
      });
      px += lengthM + partition;
    }
    gardenRect = {
      x: buildable.x,
      y: buildable.y,
      width: buildable.width,
      height: buildable.height,
      buildingOx: footprint.originX,
      buildingOy: footprint.originY,
      buildingL: footprint.buildL,
      buildingW: footprint.buildW,
      parkingRects: parkingPlaced,
    };
  } else {
    const placed = placeParking(parking, buildable, footprint, partition);
    parkingPlaced = placed.parking;
    gardenRect = placed.gardenRect;
  }
  if(parkingPlaced.length !== parking.length) {
    layoutWarning = [layoutWarning, 'Only '+parkingPlaced.length+' of '+parking.length+' requested parking spaces fit. Revise the parking arrangement before approving this concept.'].filter(Boolean).join(' ');
  }
  const garden = computeGardenBoundary(gardenRect, pack.rooms);

  return {
    ok: true,
    rooms: [...pack.rooms, ...parkingPlaced],
    buildingRooms: pack.rooms,
    parking: parkingPlaced,
    garden,
    originX: pack.originX,
    originY: pack.originY,
    buildL: pack.buildL,
    buildW: pack.buildW,
    buildable,
    layoutWarning,
  };
}

module.exports = {
  ft,
  FT,
  PARTITION_M,
  getSetbacks,
  buildableRect,
  boxesOverlap,
  sortRoomsForLayout,
  packRoomsIntoRect,
  separateSiteRooms,
  scaleRooms,
  layoutStoreyRooms,
  computeGardenBoundary,
};
