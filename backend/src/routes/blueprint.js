'use strict';
// ============================================================
// OH I SEE — Blueprint Route
// Save, retrieve and serve AI-generated blueprint data
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

// ── POST /api/blueprints — save blueprint + layout
router.post('/', authenticate, async (req, res) => {
  try {
    const { projectId, requirements, layoutData, svgContent, validationResult } = req.body;
    if (!requirements) return res.status(400).json({ error: 'Blueprint requirements are required.' });

    const { data, error } = await supabase.from('blueprints').insert([{
      project_id: projectId || null,
      user_id: req.user.id,
      requirements,
      layout_data: layoutData || {},
      svg_content: svgContent || null,
      validation_result: validationResult || {},
      is_ai_generated: true,
    }]).select().single();

    if (error) throw error;

    // Update project stage if projectId provided
    if (projectId) {
      await supabase.from('projects')
        .update({ current_stage: 'Blueprint', progress_design: 50 })
        .eq('project_id', projectId)
        .eq('user_id', req.user.id);
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[Blueprint] POST error:', err.message);
    res.status(500).json({ error: 'Failed to save blueprint.' });
  }
});

// ── GET /api/blueprints/:id — fetch blueprint
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.from('blueprints')
      .select('*')
      .eq('blueprint_id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Blueprint not found.' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load blueprint.' });
  }
});

// ── GET /api/blueprints — list user's blueprints
router.get('/', authenticate, async (req, res) => {
  try {
    const { projectId } = req.query;
    let q = supabase.from('blueprints').select('blueprint_id,project_id,version,requirements,created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load blueprints.' });
  }
});

module.exports = router;
