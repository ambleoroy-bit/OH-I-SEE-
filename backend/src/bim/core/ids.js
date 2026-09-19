'use strict';

const crypto = require('node:crypto');

function newGlobalId() {
  return crypto.randomUUID();
}

function newElementId(type, seq) {
  const prefix = String(type || 'EL')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'EL';
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

module.exports = { newGlobalId, newElementId };
