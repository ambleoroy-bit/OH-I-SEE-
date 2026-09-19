'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const bimService = require('../services/bimService');

const router = express.Router({ mergeParams: true });

router.use(authenticate);
const running=new Set();
router.use((req,res,next)=>{if(req.method!=='POST'||!['/modify','/generate'].includes(req.path))return next();const key=req.user.id+':'+req.params.projectId;if(running.has(key))return res.status(409).json({error:'A design is already being generated for this project. Please wait.'});running.add(key);res.once('finish',()=>running.delete(key));next();});

// GET /api/projects/:projectId/bim
router.get('/', async (req, res) => {
  try {
    const result = await bimService.getBimForProject(req.params.projectId, req.user.id);
    if (!result) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to load BIM model.' });
  }
});

// POST /api/projects/:projectId/bim/generate
router.post('/generate', async (req, res) => {
  try {
    const project = await bimService.getProjectForUser(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const data = await bimService.generateFromProject(project, req.user.id, {
      label: req.body?.label,
    });
    return res.status(201).json({
      success: true,
      data,
      warning: data.warning,
    });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message || 'BIM generation failed.',
      details: e.details,
    });
  }
});

// POST /api/projects/:projectId/bim/modify — natural language design changes
router.post('/modify', async (req, res) => {
  try {
    const prompt = req.body?.prompt?.trim();
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

    const data = await bimService.modifyFromPrompt(req.params.projectId, req.user.id, prompt, {
      project: req.body?.project,
      bim: req.body?.bim,
    });
    if (!data) return res.status(404).json({ error: 'Project not found.' });

    return res.status(200).json({
      success: true,
      data,
      summary: data.modification?.summary,
    });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message || 'Design modification failed.',
      details: e.details,
    });
  }
});

// POST /api/projects/:projectId/bim/validate
router.post('/validate', async (req, res) => {
  try {
    const result = await bimService.getBimForProject(req.params.projectId, req.user.id);
    if (!result?.model) return res.status(404).json({ error: 'No BIM model to validate.' });
    const validation = bimService.validate(result.model);
    res.json({ success: true, data: validation });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Validation failed.' });
  }
});

// GET /api/projects/:projectId/bim/quantities
router.get('/quantities', async (req, res) => {
  try {
    const result = await bimService.getBimForProject(req.params.projectId, req.user.id);
    if (!result?.model) return res.status(404).json({ error: 'No BIM model.' });
    const quantities = bimService.calculateQuantities(result.model);
    res.json({ success: true, data: quantities });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Quantity calculation failed.' });
  }
});

// GET /api/projects/:projectId/bim/versions
router.get('/versions', async (req, res) => {
  try {
    const versions = await bimService.listVersions(req.params.projectId, req.user.id);
    if (versions === null) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, data: versions });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to list versions.' });
  }
});

// GET /api/projects/:projectId/bim/elements/:elementId
router.get('/elements/:elementId', async (req, res) => {
  try {
    const result = await bimService.getBimForProject(req.params.projectId, req.user.id);
    if (!result?.model) return res.status(404).json({ error: 'No BIM model.' });
    const el = (result.model.elements || []).find(
      (e) => e.id === req.params.elementId || e.globalId === req.params.elementId
    );
    if (!el) return res.status(404).json({ error: 'Element not found.' });
    const rels = (result.model.relationships || []).filter(
      (r) => r.sourceId === el.id || r.targetId === el.id
    );
    res.json({ success: true, data: { element: el, relationships: rels } });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to load element.' });
  }
});

module.exports = router;
