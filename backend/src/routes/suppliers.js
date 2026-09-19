// ============================================================
// Routes: Supplier & Vendor Onboarding API Suite
// ============================================================

const express = require('express');
const router = express.Router();
const supplierService = require('../services/supplierService');
const { authenticate } = require('../middleware/auth');
const { isAdmin, isProcurement } = require('../middleware/roleGuard');

// POST /api/suppliers/onboard — Public/Vendor Onboarding Form Submission
router.post('/onboard', authenticate, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const profile = await supplierService.submitOnboarding({ ...req.body, userId });
    res.status(201).json({ success: true, message: 'Vendor Onboarding Application submitted successfully!', data: profile });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/suppliers/onboarding-requests — Admin Queue: Pending vendor applications
router.get('/onboarding-requests', authenticate, isProcurement, async (req, res) => {
  try {
    const requests = await supplierService.getOnboardingRequests();
    res.json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/suppliers/:id/approve — Admin: Approve vendor application
router.post('/:id/approve', authenticate, isAdmin, async (req, res) => {
  try {
    const approved = await supplierService.approveSupplier(req.params.id, req.user.id);
    res.json({ success: true, message: 'Supplier application approved!', data: approved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/suppliers/:id/reject — Admin: Reject vendor application
router.post('/:id/reject', authenticate, isAdmin, async (req, res) => {
  try {
    const rejected = await supplierService.rejectSupplier(req.params.id, req.user.id, req.body.reason);
    res.json({ success: true, message: 'Supplier application rejected.', data: rejected });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/suppliers — Public / Verified Active Suppliers List
router.get('/', async (req, res) => {
  try {
    const suppliers = await supplierService.getAllSuppliers();
    res.json({ success: true, count: suppliers.length, data: suppliers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/suppliers/:id — Single Supplier 360 View
router.get('/:id', async (req, res) => {
  try {
    const profile = await supplierService.getSupplierProfile(req.params.id);
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
