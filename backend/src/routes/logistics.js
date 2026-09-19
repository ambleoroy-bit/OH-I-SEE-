// ============================================================
// Routes: Logistics & Inventory API Suite
// ============================================================

const express = require('express');
const router = express.Router();
const logisticsService = require('../services/logisticsService');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

// --- Shipments ---
router.get('/shipments', authenticate, async (req, res) => {
  try {
    const { data: shipments, error } = await supabase
      .from('shipments')
      .select('*, purchase_orders(po_number)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: shipments.length, data: shipments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shipments', authenticate, async (req, res) => {
  try {
    const shipment = await logisticsService.createShipment({
      ...req.body,
      supplierId: req.user.id
    });
    res.status(201).json({ success: true, data: shipment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Gate Entries ---
router.get('/gate-entries', authenticate, async (req, res) => {
  try {
    const { data: entries, error } = await supabase
      .from('gate_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: entries.length, data: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gate-entries', authenticate, async (req, res) => {
  try {
    const gateEntry = await logisticsService.recordGateEntry(req.body);
    res.status(201).json({ success: true, data: gateEntry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Goods Receipt Notes (GRN) ---
router.get('/grns', authenticate, async (req, res) => {
  try {
    const { data: grns, error } = await supabase
      .from('goods_receipts')
      .select('*, purchase_orders(po_number), projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: grns.length, data: grns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/grns', authenticate, async (req, res) => {
  try {
    const grn = await logisticsService.createGRN(req.body);
    res.status(201).json({ success: true, data: grn });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Inventory ---
router.get('/inventory', authenticate, async (req, res) => {
  try {
    const { projectId } = req.query;
    let query = supabase.from('inventory').select('*');
    if (projectId) query = query.eq('project_id', projectId);

    const { data: items, error } = await query.order('updated_at', { ascending: false });
    if (error) throw error;

    res.json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
