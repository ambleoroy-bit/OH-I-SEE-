// ============================================================
// Store Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { createStore, getStoreConfig, updateStoreConfig } = require('../controllers/storeController');

// POST /api/stores/onboard — Create a new store (Requires auth)
router.post('/onboard', authenticate, createStore);

// GET /api/stores/config — Public config for the storefront
router.get('/config', getStoreConfig);

// PUT /api/stores/config — Update store settings (Requires auth, owner only)
router.put('/config', authenticate, updateStoreConfig);

module.exports = router;
