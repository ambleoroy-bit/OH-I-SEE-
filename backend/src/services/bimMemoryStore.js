'use strict';

/** @type {Map<string, object>} project_id -> BIM snapshot */
const store = new Map();

function save(projectId, userId, data) {
  store.set(projectId, {
    ...data,
    userId,
    status: data.status || 'ready',
    updatedAt: new Date().toISOString(),
  });
}

function get(projectId, userId) {
  const row = store.get(projectId);
  if (!row) return null;
  if (userId && row.userId && row.userId !== userId) return null;
  return row;
}

function has(projectId) {
  return store.has(projectId);
}

module.exports = { save, get, has };
