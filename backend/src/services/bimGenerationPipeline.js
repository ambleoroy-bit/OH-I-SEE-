'use strict';

const bimService = require('./bimService');

/**
 * Orchestrates requirements → BIM → validation → quantities → persist.
 */
async function run(project, userId, options = {}) {
  const result = await bimService.generateFromProject(project, userId, options);
  return {
    success: true,
    model: result.model,
    version: result.version,
    validation: result.validation,
    quantities: result.quantities,
    requirements: result.requirements,
  };
}

async function runForProjectId(projectId, userId, options = {}) {
  const project = await bimService.getProjectForUser(projectId, userId);
  if (!project) {
    const err = new Error('Project not found.');
    err.status = 404;
    throw err;
  }
  return run(project, userId, options);
}

module.exports = { run, runForProjectId };
