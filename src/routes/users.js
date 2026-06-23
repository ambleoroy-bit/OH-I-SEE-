// ============================================================
// User Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');
const { getMe, updateMe, getAllUsers, getUserStats, updateUser } = require('../controllers/userController');

// GET /api/users/stats — Admin dashboard stats (before /:id)
router.get('/stats', authenticate, isAdmin, getUserStats);

// GET /api/users/me
router.get('/me', authenticate, getMe);

// PUT /api/users/me
router.put('/me', authenticate, updateMe);

// GET /api/users — Admin: all users
router.get('/', authenticate, isAdmin, getAllUsers);

// PUT /api/users/:id — Admin: update user
router.put('/:id', authenticate, isAdmin, updateUser);

module.exports = router;
