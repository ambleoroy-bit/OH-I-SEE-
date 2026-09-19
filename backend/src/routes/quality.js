// ============================================================
// Routes: Quality, Disputes & Communication Hub API Suite
// ============================================================

const express = require('express');
const router = express.Router();
const qualityService = require('../services/qualityService');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

// --- Inspections ---
router.get('/inspections', authenticate, async (req, res) => {
  try {
    const { data: inspections, error } = await supabase
      .from('quality_inspections')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: inspections.length, data: inspections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inspections', authenticate, async (req, res) => {
  try {
    const inspection = await qualityService.recordInspection(req.body);
    res.status(201).json({ success: true, data: inspection });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Disputes ---
router.get('/disputes', authenticate, async (req, res) => {
  try {
    const { data: disputes, error } = await supabase
      .from('disputes')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: disputes.length, data: disputes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/disputes', authenticate, async (req, res) => {
  try {
    const dispute = await qualityService.raiseDispute({ ...req.body, raisedBy: req.user.id });
    res.status(201).json({ success: true, data: dispute });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/disputes/:id/resolve', authenticate, async (req, res) => {
  try {
    const dispute = await qualityService.resolveDispute(req.params.id, req.body.resolutionNotes);
    res.json({ success: true, data: dispute });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Supplier 360 Score ---
router.get('/supplier-score/:supplierId', authenticate, async (req, res) => {
  try {
    const score = await qualityService.getSupplier360(req.params.supplierId);
    res.json({ success: true, data: score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Communication Hub ---
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: conversations.length, data: conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages', authenticate, async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    if (!conversationId || !content) return res.status(400).json({ error: 'conversationId and content are required' });

    const { data: msg, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: req.user.id,
        sender_name: req.user.name || 'User',
        content
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data: msg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
