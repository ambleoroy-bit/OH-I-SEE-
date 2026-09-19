// ============================================================
// Routes: Build & Supply API Suite
// ============================================================

const express = require('express');
const router = express.Router();
const buildSupplyService = require('../services/buildSupplyService');

// GET /api/build-supply/packages — Available Turnkey Material Supply Kits
router.get('/packages', async (req, res) => {
  try {
    const packages = await buildSupplyService.getTurnkeyKits();
    res.json({ success: true, count: packages.length, data: packages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/build-supply/orders — Active Build & Supply Orders Queue
router.get('/orders', async (req, res) => {
  try {
    const orders = await buildSupplyService.getBuildSupplyOrders();
    res.json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/build-supply/orders — Submit new Build & Supply Requisition
router.post('/orders', async (req, res) => {
  try {
    const order = await buildSupplyService.createBuildSupplyOrder(req.body);
    res.status(201).json({
      success: true,
      message: 'Build & Supply Order submitted successfully! Our procurement manager will contact you within 2 hours.',
      data: order
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
