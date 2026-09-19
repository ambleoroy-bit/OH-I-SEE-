'use strict';

const { newGlobalId } = require('./ids');

/**
 * In-memory BIM model container. Persisted as model_snapshot JSONB.
 */
class BimModel {
  constructor({ projectName = 'Untitled Building', units = { length: 'm', area: 'm2', volume: 'm3' } } = {}) {
    this.schemaVersion = 1;
    this.projectName = projectName;
    this.units = units;
    this.site = null;
    this.building = null;
    this.storeys = [];
    this.elements = [];
    this.relationships = [];
    this.materials = [];
    this.metadata = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'ohisee-bim-engine',
    };
  }

  static fromJSON(json) {
    const m = new BimModel({ projectName: json?.projectName });
    Object.assign(m, json);
    return m;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      projectName: this.projectName,
      units: this.units,
      site: this.site,
      building: this.building,
      storeys: this.storeys,
      elements: this.elements,
      relationships: this.relationships,
      materials: this.materials,
      metadata: { ...this.metadata, updatedAt: new Date().toISOString() },
    };
  }

  addElement(el) {
    if (!el.globalId) el.globalId = newGlobalId();
    this.elements.push(el);
    return el;
  }

  addRelationship(rel) {
    this.relationships.push(rel);
    return rel;
  }

  getElementById(id) {
    return this.elements.find((e) => e.id === id || e.globalId === id);
  }

  getElementsByType(type) {
    return this.elements.filter((e) => e.type === type);
  }

  getElementsByStorey(storeyId) {
    return this.elements.filter((e) => e.storeyId === storeyId);
  }
}

module.exports = { BimModel };
