// ============================================================
// Partner Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { isAdmin, isPartner } = require('../middleware/roleGuard');
const {
  getMyPartnerProfile, getAllPartners,
  updatePartnerStatus, updatePartnerTier, redeemPoints
} = require('../controllers/partnerController');

// GET /api/partners/me — Own partner profile
router.get('/me', authenticate, isPartner, getMyPartnerProfile);

// GET /api/partners — Admin: all partners
router.get('/', authenticate, isAdmin, getAllPartners);

// PUT /api/partners/:id/status — Admin: approve/reject/suspend
router.put('/:id/status', authenticate, isAdmin, updatePartnerStatus);

// PUT /api/partners/:id/tier — Admin: change tier
router.put('/:id/tier', authenticate, isAdmin, updatePartnerTier);

// POST /api/partners/redeem — Partner: redeem reward points
router.post('/redeem', authenticate, isPartner, redeemPoints);

module.exports = router;
