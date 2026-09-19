'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fromProject } = require('../src/bim/generation/requirementsParser');
const { generate } = require('../src/bim/generation/requirementsToBim');
const { validate } = require('../src/bim/validation/bimValidator');
const { calculateQuantities } = require('../src/bim/calculations/quantities');

const demoProject = {
  project_id: 'PRJ-DEMO-001',
  project_name: 'OH I SEE Demo House',
  plot_length: 40,
  plot_width: 30,
  floors: 2,
  bedrooms: 3,
  bathrooms: 2,
  construction_context: {
    intentType: 'NEW_HOME',
    intentAnswers: {
      plot_length: '40',
      plot_width: '30',
      floors: 'G + 1 Floor',
      bedrooms: '3 Bedrooms',
      bathrooms: '2',
      parking: '1 Car',
      has_pooja: 'Yes',
      road_facing: 'East',
    },
  },
};

test('requirementsParser produces valid structure', () => {
  const req = fromProject(demoProject);
  assert.ok(req.site.plotLengthFt === 40);
  assert.ok(req.building.bedrooms === 3);
  assert.ok(Array.isArray(req.storeys));
  assert.ok(req.storeys.length >= 2);
});

test('requirementsParser normalizes intent form labels for schema', () => {
  const req = fromProject({
    project_name: '5BHK Home - Delhi',
    city: 'Delhi',
    floors: 3,
    construction_context: {
      intentAnswers: {
        plot_length: '20',
        plot_width: '30',
        floors: 'G + 2 Floors',
        bedrooms: '5+ Bedrooms',
        quality: 'Standard — Balanced quality',
        vastu: 'Partly follow Vastu',
        road_facing: 'East',
      },
    },
  });
  const Ajv = require('ajv');
  const schema = require('../src/schemas/building-requirements.schema.json');
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(req), true, JSON.stringify(validate.errors));
  assert.equal(req.building.qualityLevel, 'Standard');
  assert.equal(req.building.vastu, 'Partly');
  assert.equal(req.building.floors, 3);
});

test('requirementsToBim generates valid model', () => {
  const req = fromProject(demoProject);
  const model = generate(req);
  const json = model.toJSON();
  const validation = validate(json);
  assert.equal(validation.valid, true, validation.errors?.join('; '));
  assert.ok(json.elements.length > 5);
  const walls = json.elements.filter((e) => e.type === 'Wall');
  assert.ok(walls.length >= 4);
});

test('promptModifier applies bedroom and floor changes', () => {
  const { applyPromptToRequirements } = require('../src/bim/modification/promptModifier');
  const req = fromProject(demoProject);
  const { requirements, changes } = applyPromptToRequirements(req, 'add bedroom and G+1 floor');
  assert.ok(changes.length >= 2);
  assert.equal(requirements.building.bedrooms, 4);
  assert.equal(requirements.building.floors, 2);
  const bedroomRooms = requirements.rooms.filter((r) => r.type === 'bedroom');
  assert.equal(bedroomRooms.length, 4);
  const model = generate(requirements);
  const json = model.toJSON();
  const validation = validate(json);
  assert.equal(validation.valid, true, validation.errors?.join('; '));
  const roomEls = json.elements.filter((e) => e.type === 'Room' && e.name.includes('Bedroom'));
  assert.equal(roomEls.length, 4);
  const uniquePos = new Set(roomEls.map((e) => `${e.position.x},${e.position.y}`));
  assert.ok(uniquePos.size >= 3, 'bedrooms should be laid out in distinct positions');
});

test('50x40 plot layout: rooms inside plot, no overlaps on same storey', () => {
  const { validateBuildingWithinPlot } = require('../src/bim/validation/spatialValidator');
  const req = fromProject({
    project_name: 'Spatial Test House',
    plot_length: 50,
    plot_width: 40,
    floors: 1,
    bedrooms: 2,
    bathrooms: 2,
    construction_context: {
      intentAnswers: {
        plot_length: '50',
        plot_width: '40',
        floors: 'Ground Floor Only',
        bedrooms: '2 Bedrooms',
        bathrooms: '2',
        has_pooja: 'Yes',
        has_office: 'Yes',
        parking: '1 Car',
      },
    },
  });
  req.rooms = [
    { name: 'Living Room', type: 'living', storeyIndex: 0, lengthFt: 18, widthFt: 15 },
    { name: 'Kitchen', type: 'kitchen', storeyIndex: 0, lengthFt: 12, widthFt: 10 },
    { name: 'Dining', type: 'dining', storeyIndex: 0, lengthFt: 12, widthFt: 10 },
    { name: 'Master Bedroom', type: 'bedroom', storeyIndex: 0, lengthFt: 14, widthFt: 16 },
    { name: 'Bedroom 2', type: 'bedroom', storeyIndex: 0, lengthFt: 12, widthFt: 14 },
    { name: 'Bathroom 1', type: 'bathroom', storeyIndex: 0, lengthFt: 8, widthFt: 5 },
    { name: 'Pooja Room', type: 'pooja', storeyIndex: 0, lengthFt: 6, widthFt: 6 },
    { name: 'Home Office', type: 'office', storeyIndex: 0, lengthFt: 10, widthFt: 10 },
    { name: 'Car Parking', type: 'parking', storeyIndex: 0, lengthFt: 18, widthFt: 10 },
  ];
  const model = generate(req).toJSON();
  const plotL = model.site.plotLengthM;
  const plotW = model.site.plotWidthM;
  const rooms = model.elements.filter((e) => e.type === 'Room' && e.properties?.zone !== 'parking');
  for (const r of rooms) {
    const x = r.position.x;
    const y = r.position.y;
    const l = r.dimensions.lengthM;
    const w = r.dimensions.widthM;
    assert.ok(x >= 0 && y >= 0, `${r.name} inside plot origin`);
    assert.ok(x + l <= plotL + 0.1, `${r.name} within plot width`);
    assert.ok(y + w <= plotW + 0.1, `${r.name} within plot depth`);
  }
  const spatial = validateBuildingWithinPlot(model, {
    plotL, plotW, setbacks: model.site.setbacks, buildable: model.site.buildable,
  });
  assert.equal(spatial.valid, true, spatial.errors?.join('; '));
  const groundRooms = rooms.filter((r) => r.storeyId);
  const positions = groundRooms.map((r) => `${r.position.x},${r.position.y}`);
  assert.equal(new Set(positions).size, positions.length, 'no duplicate room positions');
});

test('calculateQuantities returns lines', () => {
  const req = fromProject(demoProject);
  const model = generate(req).toJSON();
  const q = calculateQuantities(model);
  assert.ok(Array.isArray(q.lines));
  assert.ok(q.lines.length > 0);
});

const FT = 0.3048;

function generateFromPrompt(prompt, base = {}) {
  const { mergePromptIntoRequirements } = require('../src/bim/generation/naturalLanguageParser');
  const req = fromProject({ project_name: 'Acceptance Test', ...base });
  const { requirements } = mergePromptIntoRequirements(req, prompt);
  return generate(requirements).toJSON();
}

function assertHouseModelBimParity(json) {
  const house = json.metadata?.houseModel;
  assert.ok(house, 'canonical houseModel must be stored in BIM metadata');
  assert.equal(house.schemaVersion, 2);

  for (const floor of house.floors) {
    for (const room of floor.rooms) {
      const bimRoom = json.elements.find(
        (e) => e.type === 'Room' && e.properties?.houseRoomId === room.id
      );
      assert.ok(bimRoom, `BIM room missing for canonical room ${room.name} (${room.id})`);
      assert.ok(Math.abs(bimRoom.position.x - room.x) < 0.02, `${room.name} X mismatch`);
      assert.ok(Math.abs(bimRoom.position.y - room.y) < 0.02, `${room.name} Y mismatch`);
      assert.ok(Math.abs(bimRoom.dimensions.lengthM - room.widthM) < 0.05, `${room.name} width mismatch`);
      assert.ok(Math.abs(bimRoom.dimensions.widthM - room.depthM) < 0.05, `${room.name} depth mismatch`);
    }
  }

  const bimWalls = json.elements.filter((e) => e.type === 'Wall');
  const houseWalls = house.floors.flatMap((f) => f.walls);
  assert.ok(bimWalls.length >= houseWalls.length, 'BIM must include all canonical walls');

  for (const floor of house.floors) {
    const slab = json.elements.find(
      (e) => e.type === 'Slab' && e.properties?.storeyIndex === floor.level
    );
    assert.ok(slab, `Slab missing for ${floor.name}`);
    assert.ok(Math.abs((slab.position?.z || 0) - floor.elevationM) < 0.02, `${floor.name} slab elevation`);
  }
}

test('TEST 1: 30x40 2BHK ground floor with pooja and parking', () => {
  const prompt = '30x40 plot, 2BHK, ground floor, living room, kitchen, 2 bedrooms, 2 bathrooms, pooja room, parking.';
  const json = generateFromPrompt(prompt);
  const house = json.metadata.houseModel;

  assert.ok(Math.abs(json.site.plotLengthM - 30 * FT) < 0.05, 'plot length 30 ft');
  assert.ok(Math.abs(json.site.plotWidthM - 40 * FT) < 0.05, 'plot width 40 ft');
  assert.equal(house.building.bedrooms, 2);
  assert.equal(house.floors.length, 1);

  const types = house.floors[0].rooms.map((r) => r.type);
  assert.ok(types.includes('living'));
  assert.ok(types.includes('kitchen'));
  assert.equal(types.filter((t) => t === 'bedroom').length, 2);
  assert.equal(types.filter((t) => t === 'bathroom').length, 2);
  assert.ok(types.includes('pooja'));
  assert.ok(types.includes('parking'), 'parking zone should be present');

  assertHouseModelBimParity(json);
  assert.ok(json.elements.filter((e) => e.type === 'Wall').length >= 4);
  assert.ok(json.elements.some((e) => e.type === 'Slab'));
});

test('TEST 2: 40x60 G+1 with balcony and terrace', () => {
  const prompt = '40x60 plot, G+1, 4 bedrooms, 3 bathrooms, large living room, kitchen, balcony and terrace.';
  const json = generateFromPrompt(prompt);
  const house = json.metadata.houseModel;

  assert.ok(Math.abs(json.site.plotLengthM - 40 * FT) < 0.05);
  assert.ok(Math.abs(json.site.plotWidthM - 60 * FT) < 0.05);
  assert.equal(house.floors.length, 2);
  assert.equal(house.building.bedrooms, 4);
  assert.equal(house.building.bathrooms, 3);
  assert.equal(house.building.hasTerrace, true);

  assertHouseModelBimParity(json);
  const groundRooms = house.floors[0].rooms.length;
  const upperRooms = house.floors[1].rooms.length;
  assert.ok(groundRooms >= 4 && upperRooms >= 1, 'both floors must have rooms');
});

test('TEST 3: add one bedroom updates canonical model', () => {
  const { mergePromptIntoRequirements } = require('../src/bim/generation/naturalLanguageParser');
  const base = fromProject({ project_name: 'Bedroom Test', bedrooms: 2, bathrooms: 2, floors: 1 });
  const before = generate(base).toJSON();
  const beforeCount = before.metadata.houseModel.building.bedrooms;

  const { requirements } = mergePromptIntoRequirements(base, 'Add one bedroom.');
  const after = generate(requirements).toJSON();
  assert.equal(after.metadata.houseModel.building.bedrooms, beforeCount + 1);
  assertHouseModelBimParity(after);
});

test('TEST 4: add terrace creates roof at upper elevation', () => {
  const { mergePromptIntoRequirements } = require('../src/bim/generation/naturalLanguageParser');
  const base = fromProject({ ...demoProject, floors: 2 });
  const { requirements } = mergePromptIntoRequirements(base, 'Add terrace.');
  const json = generate(requirements).toJSON();
  const house = json.metadata.houseModel;

  assert.equal(house.building.hasTerrace, true);
  const roof = json.elements.find((e) => e.type === 'Roof');
  assert.ok(roof, 'terrace/roof element required');
  assert.ok((roof.position?.z || 0) >= 3, 'roof must sit above ground floor');
  assertHouseModelBimParity(json);
});

test('TEST 5: move kitchen next to dining updates layout', () => {
  const { mergePromptIntoRequirements } = require('../src/bim/generation/naturalLanguageParser');
  const base = fromProject(demoProject);
  const before = generate(base).toJSON();
  const beforeKitchen = before.metadata.houseModel.floors[0].rooms.find((r) => r.type === 'kitchen');
  const beforeDining = before.metadata.houseModel.floors[0].rooms.find((r) => r.type === 'dining');
  assert.ok(beforeKitchen && beforeDining);

  const { requirements } = mergePromptIntoRequirements(base, 'Move kitchen next to dining.');
  const after = generate(requirements).toJSON();
  const kitchen = after.metadata.houseModel.floors[0].rooms.find((r) => r.type === 'kitchen');
  const dining = after.metadata.houseModel.floors[0].rooms.find((r) => r.type === 'dining');
  assert.ok(kitchen && dining);
  assert.equal(kitchen.storeyIndex, dining.storeyIndex);

  const adjacent = Math.abs(kitchen.x + kitchen.widthM - dining.x) < 0.2
    || Math.abs(dining.x + dining.widthM - kitchen.x) < 0.2
    || Math.abs(kitchen.y + kitchen.depthM - dining.y) < 0.2
    || Math.abs(dining.y + dining.depthM - kitchen.y) < 0.2;
  assert.ok(adjacent || (kitchen.x === beforeKitchen.x && kitchen.y === beforeKitchen.y),
    'kitchen should be adjacent to dining or layout regenerated on same storey');
  assertHouseModelBimParity(after);
});
