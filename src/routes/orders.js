// ============================================================
// Order Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');
const {
  createOrder, getUserOrders, getOrder,
  getAllOrders, updateOrderStatus, getOrderStats
} = require('../controllers/orderController');

// GET /api/orders/stats — Admin stats (must be before /:id)
router.get('/stats', authenticate, isAdmin, getOrderStats);

// GET /api/orders/all — Admin: all orders
router.get('/all', authenticate, isAdmin, getAllOrders);

// GET /api/orders — Authenticated user's orders
router.get('/', authenticate, getUserOrders);

// POST /api/orders — Place an order
router.post('/', authenticate, createOrder);

// GET /api/orders/:id — Single order (owner or admin)
router.get('/:id', authenticate, getOrder);

// PUT /api/orders/:id/status — Admin: update status
router.put('/:id/status', authenticate, isAdmin, updateOrderStatus);

module.exports = router;
