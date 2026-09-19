// ============================================================
// Routes: Procurement API Suite
// ============================================================

const express = require('express');
const router = express.Router();
const procurementService = require('../services/procurementService');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

// --- Purchase Requisitions ---
router.get('/purchase-requisitions', authenticate, async (req, res) => {
  try {
    const { data: prs, error } = await supabase
      .from('purchase_requisitions')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: prs.length, data: prs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/purchase-requisitions', authenticate, async (req, res) => {
  try {
    const pr = await procurementService.createPR({ ...req.body, requestedBy: req.user.id });
    res.status(201).json({ success: true, data: pr });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/purchase-requisitions/:id/approve', authenticate, async (req, res) => {
  try {
    const pr = await procurementService.approvePR(req.params.id, req.user.id);
    res.json({ success: true, data: pr });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- RFQs ---
router.get('/rfqs', authenticate, async (req, res) => {
  try {
    const { data: rfqs, error } = await supabase
      .from('rfqs')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: rfqs.length, data: rfqs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs', authenticate, async (req, res) => {
  try {
    const rfq = await procurementService.createRFQ(req.body);
    res.status(201).json({ success: true, data: rfq });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Supplier Quotations ---
router.get('/quotations', authenticate, async (req, res) => {
  try {
    const { rfqId } = req.query;
    let query = supabase.from('supplier_quotations').select('*');
    if (rfqId) query = query.eq('rfq_id', rfqId);

    const { data: quotes, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ success: true, count: quotes.length, data: quotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/quotations', authenticate, async (req, res) => {
  try {
    const quote = await procurementService.submitQuotation({
      ...req.body,
      supplierId: req.user.id,
      supplierName: req.user.name || req.body.supplierName
    });
    res.status(201).json({ success: true, data: quote });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/quotations/compare/:rfqId', authenticate, async (req, res) => {
  try {
    const comparison = await procurementService.compareQuotations(req.params.rfqId);
    res.json({ success: true, data: comparison });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Purchase Orders ---
router.get('/purchase-orders', authenticate, async (req, res) => {
  try {
    const { data: pos, error } = await supabase
      .from('purchase_orders')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: pos.length, data: pos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/purchase-orders/from-quotation', authenticate, async (req, res) => {
  try {
    const { quotationId } = req.body;
    if (!quotationId) return res.status(400).json({ error: 'quotationId is required' });

    const po = await procurementService.createPOFromQuotation(quotationId, req.user.id);
    res.status(201).json({ success: true, data: po });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
