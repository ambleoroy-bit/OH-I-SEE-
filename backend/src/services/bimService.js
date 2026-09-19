'use strict';

const Ajv = require('ajv');
const supabase = require('../config/supabase');
const buildingSchema = require('../schemas/building-requirements.schema.json');
const { fromProject } = require('../bim/generation/requirementsParser');
const { generate } = require('../bim/generation/requirementsToBim');
const { validate } = require('../bim/validation/bimValidator');
const { calculateQuantities } = require('../bim/calculations/quantities');
const {
  findMemoryProject,
  isProjectsDbUnavailable,
  upsertMemoryProject,
} = require('./projectMemoryStore');
const bimMemory = require('./bimMemoryStore');
const { applyPromptToRequirements } = require('../bim/modification/promptModifier');

const ajv = new Ajv({ allErrors: true, strict: false });
const validateRequirements = ajv.compile(buildingSchema);

function isBimDbUnavailable(error) {
  if (!error) return false;
  const msg = String(error.message || error.details || error.code || '').toLowerCase();
  return msg.includes('could not find')
    || msg.includes('schema cache')
    || msg.includes('relation')
    || msg.includes('bim_models');
}

function normalizeProjectId(projectId) {
  return String(projectId || '').trim().replace(/\s+/g, '').toUpperCase();
}

async function getProjectForUser(projectId, userId) {
  const id = normalizeProjectId(projectId);
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('project_id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!error && data) return data;
  if (error && !isProjectsDbUnavailable(error)) {
    throw Object.assign(new Error('Project storage unavailable.'), { status: 503 });
  }
  const memory = findMemoryProject(id, userId);
  return memory && memory.user_id === userId ? memory : null;
}

function projectFromRequirements(projectId, requirements) {
  const building = requirements?.building || {};
  const site = requirements?.site || {};
  return {
    project_id: projectId,
    project_name: requirements?.projectName || 'Home Project',
    city: requirements?.city || '',
    floors: building.floors || 1,
    bedrooms: building.bedrooms || 3,
    bathrooms: building.bathrooms || 2,
    plot_length: site.plotLengthFt,
    plot_width: site.plotWidthFt,
    construction_context: {
      intentType: 'NEW_HOME',
      intentAnswers: {
        plot_length: String(site.plotLengthFt || ''),
        plot_width: String(site.plotWidthFt || ''),
        floors: building.floors > 1 ? 'G + 1 Floor' : 'Ground Floor Only',
        bedrooms: `${building.bedrooms || 3} Bedrooms`,
        bathrooms: String(building.bathrooms || 2),
      },
    },
  };
}

async function resolveProjectForUser(projectId, userId, projectHint) {
  const id = normalizeProjectId(projectId);
  let project = await getProjectForUser(id, userId);
  if (project) return project;

  if (projectHint && typeof projectHint === 'object') {
    const row = {
      ...projectHint,
      project_id: normalizeProjectId(projectHint.project_id || id),
    };
    return upsertMemoryProject(row, userId);
  }

  const bimCached = bimMemory.get(id, userId);
  if (bimCached?.requirements) {
    return upsertMemoryProject(projectFromRequirements(id, bimCached.requirements), userId);
  }

  return null;
}

async function getBimModelRow(projectUuid) {
  const { data, error } = await supabase
    .from('bim_models')
    .select('*, bim_versions!bim_models_current_version_id_fkey(*)')
    .eq('project_id', projectUuid)
    .maybeSingle();
  if (error && !isBimDbUnavailable(error)) {
    throw Object.assign(new Error('BIM storage unavailable.'), { status: 503 });
  }
  return data || null;
}

function persistElements(versionId, model) {
  return (model.elements || []).map((el) => ({
    bim_version_id: versionId,
    element_id: el.id,
    global_id: el.globalId,
    type: el.type,
    name: el.name,
    storey_id: el.storeyId,
    geometry: el.geometry || {},
    properties: el.properties || {},
    quantity: el.quantity || {},
  }));
}

function persistRelationships(versionId, model) {
  return (model.relationships || []).map((rel) => ({
    bim_version_id: versionId,
    source_element_id: rel.sourceId,
    target_element_id: rel.targetId,
    relationship_type: rel.type,
    properties: rel.properties || {},
  }));
}

function buildGenerationResult(project, requirements, snapshot, validation, quantities, versionMeta) {
  return {
    model: snapshot,
    version: versionMeta,
    validation,
    quantities,
    requirements,
    status: 'ready',
  };
}

async function persistToDatabase(project, userId, snapshot, requirements, validation, label) {
  const {data,error}=await supabase.rpc('save_bim_snapshot',{p_project:project.id,p_owner:userId,p_requirements:requirements,p_snapshot:snapshot,p_validation:validation,p_label:label||null});
  if(error)throw error;
  return data;
}

async function assertStorageReady() {
  const {error}=await supabase.from('bim_models').select('id').limit(1);
  if(error)throw Object.assign(new Error('BIM storage is not ready. Apply database/bim_persistence_repair.sql on the server, then retry. No OpenAI request was made.'),{status:503});
}

async function generateFromRequirements(project, userId, requirements, { label, interpretation } = {}) {
  if (!validateRequirements(requirements)) {
    const err = new Error('Structured requirements validation failed.');
    err.status = 400;
    err.details = validateRequirements.errors;
    throw err;
  }

  const model = generate(requirements);
  model.metadata = {...model.metadata,clientBrief:interpretation?.clientBrief||null,designStatus:'Concept design — professional review required',designWarnings:interpretation?.warnings||[],designChanges:interpretation?.changes||[]};
  const validation = validate(model);
  if (!validation.valid) {
    const err = new Error('BIM validation failed.');
    err.status = 422;
    err.details = validation.errors;
    throw err;
  }

  const quantities = calculateQuantities(model);
  const snapshot = model.toJSON();
  const cached = bimMemory.get(project.project_id, userId);
  const nextVer = (cached?.version?.version_number || 0) + 1;
  const versionMeta = { version_number: nextVer, label: label || `Version ${nextVer}` };

  let result = buildGenerationResult(project, requirements, snapshot, validation, quantities, versionMeta);
  if (project.id && String(project.id).length > 10) {
    try {
      const version = await persistToDatabase(project, userId, snapshot, requirements, validation, label);
      versionMeta.version_number = version.version_number;
      versionMeta.label = version.label;
      versionMeta.id = version.id;
      result = buildGenerationResult(project, requirements, snapshot, validation, quantities, versionMeta);
      result.persisted = true;
      bimMemory.save(project.project_id, userId, result);
    } catch (dbErr) {
      await supabase.from('projects').update({bim_generation_status:'failed'}).eq('id',project.id).eq('user_id',userId);
      console.error('BIM persistence failed:', dbErr.code || 'unknown');
      throw Object.assign(new Error('Could not save this BIM version. No partial version was committed. Check the BIM database migration and retry.'),{status:503});
    }
  } else {
    result.persisted = false;
  }

  return result;
}

async function generateFromProject(project, userId, { label } = {}) {
  await assertStorageReady();
  const base=fromProject(project);
  const brief=require('./clientDesignBrief').collect(project);
  const interpreted=await require('./openaiBim').interpret(base,'Create the initial concept from this client project. Preserve every room quantity, plot, setbacks, floor count and valid requested room area. Arrange the rooms across the floors. Clearly disclose unresolved requirements. Invalid tiny room areas use the proposed defaults supplied in current_requirements; do not present them as client-approved.',{clientBrief:brief.inputs});
  require('./clientDesignBrief').enforceSavedProgram(base,interpreted.requirements);
  interpreted.warnings=[...brief.warnings,...interpreted.warnings];
  interpreted.clientBrief=brief;
  return generateFromRequirements(project,userId,interpreted.requirements,{label:label||'Client requirements concept',interpretation:interpreted});
}

async function modifyFromPrompt(projectId, userId, prompt, { project: projectHint, bim: bimHint } = {}) {
  const id = normalizeProjectId(projectId);
  const project = await getProjectForUser(id, userId);
  if (!project) return null;

  const bim = await getBimForProject(id, userId);
  const baseReq = bim?.requirements
    || bim?.version?.structured_input
    || fromProject(project);

  await assertStorageReady();
  const brief=require('./clientDesignBrief').collect(project);
  const interpreted = await require('./openaiBim').interpret(baseReq, prompt,{clientBrief:brief.inputs});
  interpreted.clientBrief=brief;
  interpreted.warnings=[...brief.warnings,...interpreted.warnings];
  const { requirements, changes, summary } = interpreted;
  if (!changes.length) {
    const err = new Error(summary);
    err.status = 400;
    throw err;
  }

  const result = await generateFromRequirements(project, userId, requirements, {
    label: `Design: ${String(prompt).slice(0, 80)}`,
    interpretation: interpreted,
  });
  result.project = project;
  result.modification = { prompt, changes, summary, warnings:interpreted.warnings, provider:interpreted.provider, model:interpreted.model };
  return result;
}

async function getBimForProject(projectId, userId) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;

  let bimModel;
  try {
    bimModel = project.id ? await getBimModelRow(project.id) : null;
  } catch {
    return { project, model: null, version: null, status: project.bim_generation_status === 'generating' ? 'failed' : (project.bim_generation_status || 'none') };
  }

  if (!bimModel) {
    return { project, model: null, version: null, status: project.bim_generation_status || 'none' };
  }

  let version = bimModel.bim_versions;
  if (!version && bimModel.current_version_id) {
    const { data } = await supabase
      .from('bim_versions')
      .select('*')
      .eq('id', bimModel.current_version_id)
      .maybeSingle();
    version = data;
  }

  const dbResult = {
    project,
    model: version?.model_snapshot || null,
    version,
    validation: version?.validation_result || null,
    status: version?.model_snapshot ? 'ready' : 'failed',
    requirements: version?.structured_input || null,
    quantities: version?.model_snapshot ? calculateQuantities(version.model_snapshot) : null,
    source: 'database',
  };

  if (dbResult.model) {
    bimMemory.save(projectId, userId, dbResult);
  }

  return dbResult;
}

async function listVersions(projectId, userId) {
  const cached = bimMemory.get(projectId, userId);
  if (cached?.version) {
    return [cached.version];
  }

  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;
  const bimModel = project.id ? await getBimModelRow(project.id) : null;
  if (!bimModel) return [];
  const { data } = await supabase
    .from('bim_versions')
    .select('id, version_number, label, created_at, validation_result')
    .eq('bim_model_id', bimModel.id)
    .order('version_number', { ascending: false });
  return data || [];
}

function generateInMemory(project) {
  const requirements = fromProject(project);
  const model = generate(requirements);
  const validation = validate(model);
  const quantities = calculateQuantities(model);
  return { requirements, model: model.toJSON(), validation, quantities };
}

module.exports = {
  getProjectForUser,
  generateFromProject,
  generateFromRequirements,
  modifyFromPrompt,
  getBimForProject,
  listVersions,
  generateInMemory,
  validate,
  calculateQuantities,
};
