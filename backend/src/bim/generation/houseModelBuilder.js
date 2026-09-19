'use strict';

const { HouseModel } = require('../core/houseModel');
const {
  layoutBuilding,
  partitionWallsForLayout,
  exteriorWalls,
} = require('./layoutBuilding');

const WALL_HEIGHT_M = 3.0;
const WALL_THICKNESS_M = 0.23;
const SLAB_THICKNESS_M = 0.15;

/**
 * Build canonical HouseModel from structured building requirements.
 * @param {Object} requirements
 * @returns {HouseModel}
 */
function buildHouseModel(requirements) {
  const layout = layoutBuilding(requirements);
  const {
    originX: ox, originY: oy, buildL, buildW, plotL, plotW,
    setbacks, buildable, garden, layoutError, storeyLayouts,
  } = layout;

  if (layoutError) {
    const err = new Error(layoutError);
    err.status = 422;
    throw err;
  }

  const house = new HouseModel({ projectName: requirements.projectName || 'Home' });
  house.plot = {
    widthM: plotL,
    depthM: plotW,
    unit: 'm',
    roadFacing: requirements.site?.roadFacing || 'East',
    setbacks,
    buildable,
  };
  house.building = { ...(requirements.building || {}) };
  house.layoutWarnings=storeyLayouts.map(s=>s.layoutWarning).filter(Boolean);

  if (garden && garden.width >= 2 && garden.height >= 2) {
    house.garden = {
      id: 'GARDEN-001',
      name: garden.name || 'Garden',
      x: garden.x,
      y: garden.y,
      widthM: garden.width,
      depthM: garden.height,
    };
  }

  const storeyMeta = requirements.storeys?.length
    ? requirements.storeys
    : storeyLayouts.map((_, i) => ({
      index: i,
      name: ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'][i] || `Floor ${i}`,
      elevationM: i * WALL_HEIGHT_M,
      clearHeightM: WALL_HEIGHT_M,
    }));

  let topElevation = 0;

  for (let si = 0; si < storeyLayouts.length; si++) {
    const storeyLayout = storeyLayouts[si];
    const ox=storeyLayout.originX ?? layout.originX, oy=storeyLayout.originY ?? layout.originY;
    const meta = storeyMeta[si] || { elevationM: si * WALL_HEIGHT_M, clearHeightM: WALL_HEIGHT_M };
    const elevationM = meta.elevationM ?? si * WALL_HEIGHT_M;
    const sBuildL = storeyLayout.buildL || buildL;
    const sBuildW = storeyLayout.buildW || buildW;
    const floorId = `FLOOR-${si}`;

    const extSpecs = exteriorWalls(ox, oy, sBuildL, sBuildW, si, elevationM, WALL_HEIGHT_M);
    const partSpecs = partitionWallsForLayout(storeyLayout, si, WALL_HEIGHT_M, elevationM);

    const walls = [...extSpecs, ...partSpecs].map((spec) => ({
      id: spec.id,
      floorId,
      start: { ...spec.start },
      end: { ...spec.end },
      thicknessM: WALL_THICKNESS_M,
      heightM: spec.heightM || WALL_HEIGHT_M,
      elevationM: spec.elevationM ?? elevationM,
      exterior: !!spec.exterior,
      interior: !!spec.interior,
    }));

    const layoutRooms = storeyLayout.rooms || [];
    const rooms = layoutRooms.map((room, ri) => ({
      id: `ROOM-${si}-${ri}`,
      type: room.type,
      name: room.name,
      x: room.x,
      y: room.y,
      widthM: room.lengthM,
      depthM: room.widthM,
      storeyIndex: si,
      wallIds: [],
      zone: room.zone || (room.type === 'parking' ? 'parking' : undefined),
    }));

    const doors = [];
    const windows = [];
    const extWallIds = walls.filter((w) => w.exterior).map((w) => w.id);

    if (si === 0 && extWallIds.length >= 1) {
      doors.push({
        id: 'DOOR-MAIN',
        wallId: extWallIds[0],
        positionOnWall: 0.5,
        widthM: 1.0,
        heightM: 2.1,
        elevationM,
        name: 'Main Door',
      });

      const bedrooms = requirements.building?.bedrooms || 3;
      const winCount = Math.min(6, Math.max(2, bedrooms + 1));
      const winWalls = extWallIds.slice(1);
      for (let w = 0; w < winCount; w++) {
        const host = winWalls[w % winWalls.length] || extWallIds[0];
        windows.push({
          id: `WIN-${si}-${w}`,
          wallId: host,
          positionOnWall: (w + 1) / (winCount + 1),
          widthM: 1.2,
          heightM: 1.2,
          sillHeightM: 0.9,
          elevationM,
        });
      }
    }

    const slab = {
      id: `SLAB-${si}`,
      elevationM,
      thicknessM: SLAB_THICKNESS_M,
      boundary: [
        { x: ox, y: oy },
        { x: ox + sBuildL, y: oy },
        { x: ox + sBuildL, y: oy + sBuildW },
        { x: ox, y: oy + sBuildW },
      ],
    };

    house.floors.push({
      id: floorId,
      level: si,
      name: meta.name || `Floor ${si}`,
      elevationM,
      clearHeightM: meta.clearHeightM || WALL_HEIGHT_M,
      footprint: { x: ox, y: oy, widthM: sBuildL, depthM: sBuildW },
      rooms,
      walls,
      doors,
      windows,
      stairs: [],
      balconies: (requirements.rooms || [])
        .filter((r) => r.type === 'balcony' && (r.storeyIndex || 0) === si)
        .map((r, bi) => ({
          id: `BALCONY-${si}-${bi}`,
          x: r.x || ox,
          y: r.y || oy,
          widthM: r.lengthFt ? r.lengthFt * 0.3048 : 2.4,
          depthM: r.widthFt ? r.widthFt * 0.3048 : 1.2,
          elevationM,
        })),
      terrace: requirements.building?.hasTerrace && si === storeyLayouts.length - 1
        ? { id: 'TERRACE-001', elevationM: elevationM + WALL_HEIGHT_M }
        : null,
      slab,
    });

    topElevation = elevationM + WALL_HEIGHT_M;

    for (const p of storeyLayout.parking || []) {
      house.parking.push({
        id: `PARK-${house.parking.length}`,
        x: p.x,
        y: p.y,
        widthM: p.lengthM,
        depthM: p.widthM,
        storeyIndex: si,
      });
    }
  }

  const topFloor = house.floors[house.floors.length - 1];
  house.roof = {
    type: requirements.building?.hasTerrace ? 'terrace' : 'flat',
    elevationM: topElevation,
    footprint: topFloor ? { ...topFloor.footprint } : { x: ox, y: oy, widthM: buildL, depthM: buildW },
    thicknessM: 0.2,
  };

  return house;
}

module.exports = { buildHouseModel, WALL_HEIGHT_M, WALL_THICKNESS_M, SLAB_THICKNESS_M };
