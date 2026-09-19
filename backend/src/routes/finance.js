// ============================================================
// Routes: Finance & Accounts Payable API Suite
// ============================================================

const express = require('express');
const router = express.Router();
const financeService = require('../services/financeService');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

// --- Invoices ---
router.get('/invoices', authenticate, async (req, res) => {
  try {
    const { data: invoices, error } = await supabase
      .from('supplier_invoices')
      .select('*, purchase_orders(po_number), projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/invoices', authenticate, async (req, res) => {
  try {
    const result = await financeService.submitInvoice({
      ...req.body,
      supplierId: req.user.id
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/invoices/:id/match', authenticate, async (req, res) => {
  try {
    const result = await financeService.performThreeWayMatch(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Payments ---
router.get('/payments', authenticate, async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: payments.length, data: payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments', authenticate, async (req, res) => {
  try {
    const payment = await financeService.processPayment({
      ...req.body,
      payerId: req.user.id
    });
    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
