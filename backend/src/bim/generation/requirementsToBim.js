'use strict';

const { buildHouseModel } = require('./houseModelBuilder');
const { validateHouseModel } = require('../validation/houseModelValidator');
const { houseModelToBim } = require('./houseModelToBim');

/**
 * Parametric BIM generator from structured building requirements.
 * Pipeline: requirements → canonical HouseModel → validation → BimModel
 */
function generate(requirements) {
  const houseModel = buildHouseModel(requirements);
  const houseValidation = validateHouseModel(houseModel);

  if (!houseValidation.valid) {
    const err = new Error(houseValidation.errors[0] || 'Floor plan validation failed.');
    err.status = 422;
    err.details = houseValidation.errors;
    err.warnings = houseValidation.warnings;
    throw err;
  }

  const model = houseModelToBim(houseModel, requirements);
  houseValidation.warnings=[...(houseValidation.warnings||[]),...(houseModel.layoutWarnings||[])];
  if (houseValidation.warnings?.length) {
    model.metadata.layoutWarnings = houseValidation.warnings;
  }
  return model;
}

module.exports = { generate };
