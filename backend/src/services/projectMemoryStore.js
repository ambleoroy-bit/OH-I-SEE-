'use strict';

/** @type {Array<object>} */
let inMemoryProjects = [];

function bindProjects(projectsArray) {
  inMemoryProjects = projectsArray;
}

function isProjectsDbUnavailable(error) {
  if (!error) return false;
  const msg = String(error.message || error.details || '').toLowerCase();
  return msg.includes('could not find the table')
    || msg.includes('does not exist')
    || msg.includes('schema cache')
    || msg.includes('relation');
}

function generateUniqueProjectId(extraIds = []) {
  const existing = new Set([
    ...inMemoryProjects.map((p) => p.project_id),
    ...extraIds,
  ]);
  let id;
  do {
    id = `PRJ-${Math.floor(10000 + Math.random() * 90000)}`;
  } while (existing.has(id));
  return id;
}

function listMemoryProjectsForUser(userId) {
  return inMemoryProjects
    .filter((p) => p.user_id === userId)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

function findMemoryProject(projectId, userId) {
  const owned = inMemoryProjects.find((p) => p.project_id === projectId && p.user_id === userId);
  if (owned) return owned;
  return inMemoryProjects.find((p) => p.project_id === projectId) || null;
}

function saveMemoryProject(row, userId) {
  const now = new Date().toISOString();
  const project = {
    id: Date.now(),
    ...row,
    user_id: userId,
    status: row.status || 'active',
    acceptance_status: row.acceptance_status || 'pending_vendor',
    current_stage: row.current_stage || 'Requirement',
    created_at: now,
    updated_at: now,
  };
  inMemoryProjects.push(project);
  return project;
}

function upsertMemoryProject(row, userId) {
  const projectId = row.project_id;
  if (!projectId) return null;
  const now = new Date().toISOString();
  const idx = inMemoryProjects.findIndex(
    (p) => p.project_id === projectId && p.user_id === userId
  );
  if (idx >= 0) {
    inMemoryProjects[idx] = {
      ...inMemoryProjects[idx],
      ...row,
      user_id: userId,
      updated_at: now,
    };
    return inMemoryProjects[idx];
  }
  return saveMemoryProject(row, userId);
}

function updateMemoryProject(projectId, userId, updates) {
  const idx = inMemoryProjects.findIndex(
    (p) => p.project_id === projectId && p.user_id === userId
  );
  if (idx === -1) return null;
  inMemoryProjects[idx] = {
    ...inMemoryProjects[idx],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  return inMemoryProjects[idx];
}

function deleteMemoryProject(projectId, userId) {
  const idx = inMemoryProjects.findIndex(
    (p) => p.project_id === projectId && p.user_id === userId
  );
  if (idx === -1) return false;
  inMemoryProjects.splice(idx, 1);
  return true;
}

function getAllMemoryProjects() {
  return inMemoryProjects;
}

function mergeProjects(dbRows, userId) {
  const byId = new Map();
  for (const p of dbRows || []) byId.set(p.project_id, p);
  for (const p of listMemoryProjectsForUser(userId)) {
    if (!byId.has(p.project_id)) byId.set(p.project_id, p);
  }
  return [...byId.values()].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

module.exports = {
  bindProjects,
  isProjectsDbUnavailable,
  generateUniqueProjectId,
  listMemoryProjectsForUser,
  findMemoryProject,
  getAllMemoryProjects,
  saveMemoryProject,
  upsertMemoryProject,
  updateMemoryProject,
  deleteMemoryProject,
  mergeProjects,
};
