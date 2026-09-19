'use strict';

const { BimModel } = require('../core/BimModel');
const { newElementId, newGlobalId } = require('../core/ids');
const { validateBuildingWithinPlot } = require('../validation/spatialValidator');
const { WALL_HEIGHT_M, SLAB_THICKNESS_M } = require('./houseModelBuilder');

function ts() {
  return new Date().toISOString();
}

function addWallElement(model, seq, spec, storeyId, matId) {
  const wid = newElementId('WALL', seq.v++);
  const lengthM = Math.hypot(spec.end.x - spec.start.x, spec.end.y - spec.start.y);
  const elev = spec.elevationM || 0;
  model.addElement({
    id: wid,
    globalId: newGlobalId(),
    type: 'Wall',
    name: spec.interior ? 'Partition Wall' : `Exterior Wall ${spec.id}`,
    storeyId,
    geometry: {
      kind: 'parametricWall',
      startPoint: spec.start,
      endPoint: spec.end,
      heightM: spec.heightM || WALL_HEIGHT_M,
      thicknessM: spec.thicknessM || 0.23,
      openings: [],
    },
    position: { x: spec.start.x, y: spec.start.y, z: elev },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { lengthM, heightM: spec.heightM || WALL_HEIGHT_M, thicknessM: spec.thicknessM || 0.23 },
    materialId: matId,
    properties: { interior: !!spec.interior, exterior: !!spec.exterior, wallKey: spec.id },
    quantity: {
      lengthM,
      heightM: spec.heightM || WALL_HEIGHT_M,
      thicknessM: spec.thicknessM || 0.23,
      volumeM3: Math.round(lengthM * (spec.heightM || WALL_HEIGHT_M) * 0.23 * 1000) / 1000,
    },
    relationships: [],
    createdAt: ts(),
    updatedAt: ts(),
  });
  model.addRelationship({ sourceId: storeyId, targetId: wid, type: 'contains' });
  return wid;
}

/**
 * Convert canonical HouseModel → BimModel for viewers and persistence.
 * @param {import('../core/houseModel').HouseModel} house
 * @param {Object} [requirements]
 * @returns {BimModel}
 */
function houseModelToBim(house, requirements = {}) {
  const model = new BimModel({ projectName: house.projectName });
  const seq = { v: 1 };
  const matId = 'MAT-AAC-BLOCK';

  model.site = {
    plotLengthM: house.plot.widthM,
    plotWidthM: house.plot.depthM,
    roadFacing: house.plot.roadFacing,
    setbacks: house.plot.setbacks,
    buildable: house.plot.buildable,
  };
  model.building = house.building || {};
  model.storeys = house.floors.map((f) => ({
    index: f.level,
    name: f.name,
    elevationM: f.elevationM,
    clearHeightM: f.clearHeightM,
  }));

  model.materials.push({
    id: matId,
    name: 'AAC Block',
    category: 'masonry',
    properties: { density: '600 kg/m3' },
  });

  const plotL = house.plot.widthM;
  const plotW = house.plot.depthM;

  const siteId = newElementId('SITE', seq.v++);
  model.addElement({
    id: siteId,
    globalId: newGlobalId(),
    type: 'Site',
    name: 'Site',
    storeyId: null,
    geometry: { kind: 'plot', boundary: [[0, 0], [plotL, 0], [plotL, plotW], [0, plotW]] },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { lengthM: plotL, widthM: plotW },
    materialId: null,
    properties: {},
    quantity: { areaM2: Math.round(plotL * plotW * 100) / 100 },
    relationships: [],
    createdAt: ts(),
    updatedAt: ts(),
  });

  const fp0 = house.floors[0]?.footprint || { x: 0, y: 0, widthM: 4, depthM: 4 };
  const buildingId = newElementId('BLDG', seq.v++);
  model.addElement({
    id: buildingId,
    globalId: newGlobalId(),
    type: 'Building',
    name: house.projectName,
    storeyId: null,
    geometry: { kind: 'footprint', origin: { x: fp0.x, y: fp0.y }, lengthM: fp0.widthM, widthM: fp0.depthM },
    position: { x: fp0.x, y: fp0.y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { lengthM: fp0.widthM, widthM: fp0.depthM, floors: house.floors.length },
    materialId: null,
    properties: { bedrooms: house.building?.bedrooms, bathrooms: house.building?.bathrooms },
    quantity: { footprintAreaM2: Math.round(fp0.widthM * fp0.depthM * 100) / 100 },
    relationships: [],
    createdAt: ts(),
    updatedAt: ts(),
  });
  model.addRelationship({ sourceId: siteId, targetId: buildingId, type: 'contains' });

  if (house.garden) {
    const g = house.garden;
    const gardenId = newElementId('GARDEN', seq.v++);
    model.addElement({
      id: gardenId,
      globalId: newGlobalId(),
      type: 'Room',
      name: g.name || 'Garden',
      storeyId: null,
      geometry: {
        kind: 'landscape',
        zone: 'garden',
        boundary: [
          [g.x, g.y],
          [g.x + g.widthM, g.y],
          [g.x + g.widthM, g.y + g.depthM],
          [g.x, g.y + g.depthM],
        ],
      },
      position: { x: g.x, y: g.y, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      dimensions: { lengthM: g.widthM, widthM: g.depthM },
      materialId: null,
      properties: { roomType: 'garden', zone: 'landscape' },
      quantity: { areaM2: Math.round(g.widthM * g.depthM * 100) / 100 },
      relationships: [],
      createdAt: ts(),
      updatedAt: ts(),
    });
    model.addRelationship({ sourceId: siteId, targetId: gardenId, type: 'contains' });
  }

  const wallIdMap = new Map();

  for (const floor of house.floors) {
    const storeyId = newElementId('STRY', seq.v++);
    model.addElement({
      id: storeyId,
      globalId: newGlobalId(),
      type: 'BuildingStorey',
      name: floor.name,
      storeyId,
      geometry: { kind: 'storey', elevationM: floor.elevationM, clearHeightM: floor.clearHeightM },
      position: { x: 0, y: 0, z: floor.elevationM },
      rotation: { x: 0, y: 0, z: 0 },
      dimensions: { clearHeightM: floor.clearHeightM },
      materialId: null,
      properties: { index: floor.level },
      quantity: {},
      relationships: [],
      createdAt: ts(),
      updatedAt: ts(),
    });
    model.addRelationship({ sourceId: buildingId, targetId: storeyId, type: 'contains' });

    const slab = floor.slab;
    const slabId = newElementId('SLAB', seq.v++);
    model.addElement({
      id: slabId,
      globalId: newGlobalId(),
      type: 'Slab',
      name: floor.level === 0 ? 'Ground Floor Slab' : `${floor.name} Slab`,
      storeyId,
      geometry: {
        kind: 'parametricSlab',
        boundary: slab.boundary,
        thicknessM: slab.thicknessM || SLAB_THICKNESS_M,
      },
      position: { x: floor.footprint.x, y: floor.footprint.y, z: floor.elevationM },
      rotation: { x: 0, y: 0, z: 0 },
      dimensions: { thicknessM: slab.thicknessM || SLAB_THICKNESS_M },
      materialId: 'MAT-CONCRETE',
      properties: { storeyIndex: floor.level },
      quantity: {
        areaM2: Math.round(floor.footprint.widthM * floor.footprint.depthM * 100) / 100,
        volumeM3: Math.round(floor.footprint.widthM * floor.footprint.depthM * (slab.thicknessM || SLAB_THICKNESS_M) * 1000) / 1000,
      },
      relationships: [],
      createdAt: ts(),
      updatedAt: ts(),
    });
    model.addRelationship({ sourceId: storeyId, targetId: slabId, type: 'contains' });

    for (const wall of floor.walls) {
      const spec = {
        id: wall.id,
        start: wall.start,
        end: wall.end,
        elevationM: wall.elevationM,
        heightM: wall.heightM,
        thicknessM: wall.thicknessM,
        exterior: wall.exterior,
        interior: wall.interior,
      };
      const bimWallId = addWallElement(model, seq, spec, storeyId, matId);
      wallIdMap.set(wall.id, bimWallId);
    }

    for (const room of floor.rooms) {
      const rid = newElementId('ROOM', seq.v++);
      model.addElement({
        id: rid,
        globalId: newGlobalId(),
        type: 'Room',
        name: room.name,
        storeyId,
        geometry: {
          kind: 'space',
          roomType: room.type,
          boundary: [
            { x: room.x, y: room.y },
            { x: room.x + room.widthM, y: room.y },
            { x: room.x + room.widthM, y: room.y + room.depthM },
            { x: room.x, y: room.y + room.depthM },
          ],
        },
        position: { x: room.x, y: room.y, z: floor.elevationM },
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { lengthM: room.widthM, widthM: room.depthM },
        materialId: null,
        properties: {
          roomType: room.type,
          storeyIndex: floor.level,
          houseRoomId: room.id,
          zone: room.zone || (room.type === 'parking' ? 'parking' : undefined),
        },
        quantity: { areaM2: Math.round(room.widthM * room.depthM * 100) / 100 },
        relationships: [],
        createdAt: ts(),
        updatedAt: ts(),
      });
      model.addRelationship({ sourceId: storeyId, targetId: rid, type: 'contains' });
    }

    for (const door of floor.doors || []) {
      const hostWallId = wallIdMap.get(door.wallId);
      if (!hostWallId) continue;
      const wall = floor.walls.find((w) => w.id === door.wallId);
      const t = door.positionOnWall;
      const pos = wall ? {
        x: wall.start.x + (wall.end.x - wall.start.x) * t,
        y: wall.start.y + (wall.end.y - wall.start.y) * t,
      } : { x: floor.footprint.x, y: floor.footprint.y };

      const doorId = newElementId('DOOR', seq.v++);
      model.addElement({
        id: doorId,
        globalId: newGlobalId(),
        type: 'Door',
        name: door.name || 'Door',
        storeyId,
        geometry: {
          kind: 'parametricDoor',
          hostWallId,
          positionOnWall: t,
          widthM: door.widthM,
          heightM: door.heightM,
        },
        position: { x: pos.x, y: pos.y, z: door.elevationM },
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { widthM: door.widthM, heightM: door.heightM },
        materialId: 'MAT-WOOD-DOOR',
        properties: { doorType: 'single', houseDoorId: door.id },
        quantity: { count: 1 },
        relationships: [],
        createdAt: ts(),
        updatedAt: ts(),
      });
      model.addRelationship({ sourceId: hostWallId, targetId: doorId, type: 'hosts' });
    }

    for (const win of floor.windows || []) {
      const hostWallId = wallIdMap.get(win.wallId);
      if (!hostWallId) continue;
      const wall = floor.walls.find((w) => w.id === win.wallId);
      const t = win.positionOnWall;
      const pos = wall ? {
        x: wall.start.x + (wall.end.x - wall.start.x) * t,
        y: wall.start.y + (wall.end.y - wall.start.y) * t,
      } : { x: floor.footprint.x, y: floor.footprint.y };

      const winId = newElementId('WIN', seq.v++);
      model.addElement({
        id: winId,
        globalId: newGlobalId(),
        type: 'Window',
        name: `Window ${win.id}`,
        storeyId,
        geometry: {
          kind: 'parametricWindow',
          hostWallId,
          positionOnWall: t,
          widthM: win.widthM,
          heightM: win.heightM,
          sillHeightM: win.sillHeightM,
        },
        position: { x: pos.x, y: pos.y, z: win.elevationM + win.sillHeightM },
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { widthM: win.widthM, heightM: win.heightM, sillHeightM: win.sillHeightM },
        materialId: 'MAT-GLASS',
        properties: { houseWindowId: win.id },
        quantity: { count: 1 },
        relationships: [],
        createdAt: ts(),
        updatedAt: ts(),
      });
      model.addRelationship({ sourceId: hostWallId, targetId: winId, type: 'hosts' });
    }
  }

  if (house.roof) {
    const r = house.roof;
    const roofId = newElementId('ROOF', seq.v++);
    const b = r.footprint;
    model.addElement({
      id: roofId,
      globalId: newGlobalId(),
      type: 'Roof',
      name: r.type === 'terrace' ? 'Terrace Roof' : 'Roof',
      storeyId: null,
      geometry: {
        kind: 'parametricRoof',
        roofType: r.type || 'flat',
        boundary: [
          { x: b.x, y: b.y },
          { x: b.x + b.widthM, y: b.y },
          { x: b.x + b.widthM, y: b.y + b.depthM },
          { x: b.x, y: b.y + b.depthM },
        ],
        thicknessM: r.thicknessM || 0.2,
      },
      position: { x: b.x, y: b.y, z: r.elevationM },
      rotation: { x: 0, y: 0, z: 0 },
      dimensions: { thicknessM: r.thicknessM || 0.2 },
      materialId: 'MAT-ROOF',
      properties: { roofType: r.type },
      quantity: { areaM2: Math.round(b.widthM * b.depthM * 100) / 100 },
      relationships: [],
      createdAt: ts(),
      updatedAt: ts(),
    });
    model.addRelationship({ sourceId: buildingId, targetId: roofId, type: 'contains' });
  }

  model.metadata.houseModel = house.toJSON ? house.toJSON() : house;

  const spatial = validateBuildingWithinPlot(model.toJSON(), {
    plotL,
    plotW,
    setbacks: house.plot.setbacks,
    buildable: house.plot.buildable,
  });
  if (!spatial.valid) {
    const err = new Error(spatial.errors[0] || 'Building layout exceeds the available plot area.');
    err.status = 422;
    err.details = spatial.errors;
    throw err;
  }

  return model;
}

module.exports = { houseModelToBim };
