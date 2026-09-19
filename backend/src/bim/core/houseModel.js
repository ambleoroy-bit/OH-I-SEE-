'use strict';

/**
 * Canonical parametric house model — single source of truth for 2D, blueprint, and 3D.
 * Coordinates: X = width, Y = depth, Z = height (meters).
 * @typedef {Object} HousePlot
 * @property {number} widthM
 * @property {number} depthM
 * @property {string} unit
 * @property {string} [roadFacing]
 * @property {Object} [setbacks]
 * @property {Object} [buildable]
 *
 * @typedef {Object} HouseRoom
 * @property {string} id
 * @property {string} type
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} widthM
 * @property {number} depthM
 * @property {number} storeyIndex
 * @property {string[]} [wallIds]
 *
 * @typedef {Object} HouseWall
 * @property {string} id
 * @property {string} floorId
 * @property {{x:number,y:number}} start
 * @property {{x:number,y:number}} end
 * @property {number} thicknessM
 * @property {number} heightM
 * @property {number} elevationM
 * @property {boolean} [exterior]
 * @property {boolean} [interior]
 *
 * @typedef {Object} HouseDoor
 * @property {string} id
 * @property {string} wallId
 * @property {number} positionOnWall
 * @property {number} widthM
 * @property {number} heightM
 * @property {number} elevationM
 *
 * @typedef {Object} HouseWindow
 * @property {string} id
 * @property {string} wallId
 * @property {number} positionOnWall
 * @property {number} widthM
 * @property {number} heightM
 * @property {number} sillHeightM
 * @property {number} elevationM
 *
 * @typedef {Object} HouseFloor
 * @property {string} id
 * @property {number} level
 * @property {string} name
 * @property {number} elevationM
 * @property {number} clearHeightM
 * @property {{x:number,y:number,widthM:number,depthM:number}} footprint
 * @property {HouseRoom[]} rooms
 * @property {HouseWall[]} walls
 * @property {HouseDoor[]} doors
 * @property {HouseWindow[]} windows
 * @property {Object[]} [stairs]
 * @property {Object[]} [balconies]
 * @property {Object|null} [terrace]
 * @property {Object} slab
 */

class HouseModel {
  constructor({ projectName = 'Untitled House', unit = 'm' } = {}) {
    this.schemaVersion = 2;
    this.projectName = projectName;
    this.unit = unit;
    this.plot = null;
    this.building = null;
    this.floors = [];
    this.parking = [];
    this.garden = null;
    this.roof = null;
    this.metadata = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'ohisee-house-engine',
    };
  }

  static fromJSON(json) {
    const m = new HouseModel({ projectName: json?.projectName, unit: json?.unit || 'm' });
    Object.assign(m, json);
    return m;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      projectName: this.projectName,
      unit: this.unit,
      plot: this.plot,
      building: this.building,
      floors: this.floors,
      parking: this.parking,
      garden: this.garden,
      roof: this.roof,
      metadata: { ...this.metadata, updatedAt: new Date().toISOString() },
    };
  }

  getFloor(level) {
    return this.floors.find((f) => f.level === level);
  }

  getRoomById(id) {
    for (const floor of this.floors) {
      const room = floor.rooms.find((r) => r.id === id);
      if (room) return room;
    }
    return null;
  }

  getWallById(id) {
    for (const floor of this.floors) {
      const wall = floor.walls.find((w) => w.id === id);
      if (wall) return wall;
    }
    return null;
  }
}

module.exports = { HouseModel };
