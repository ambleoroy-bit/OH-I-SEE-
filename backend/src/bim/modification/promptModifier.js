'use strict';

const { mergePromptIntoRequirements } = require('../generation/naturalLanguageParser');

/**
 * Applies natural-language design prompts to structured building requirements.
 * Delegates to deterministic NL parser → canonical regen pipeline.
 */
function applyPromptToRequirements(requirements, prompt) {
  return mergePromptIntoRequirements(requirements, prompt);
}

module.exports = { applyPromptToRequirements };
