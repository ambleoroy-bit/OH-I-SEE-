// ============================================================
// Auth Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const {
  signup, login, logout, forgotPassword, resetPassword, getMe
} = require('../controllers/authController');

// POST /api/auth/signup
router.post('/signup', authLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number')
], signup);

// POST /api/auth/login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required')
], login);

// POST /api/auth/logout
router.post('/logout', authenticate, logout);

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, [
  body('access_token').notEmpty(),
  body('new_password').isLength({ min: 8 })
], resetPassword);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

module.exports = router;
