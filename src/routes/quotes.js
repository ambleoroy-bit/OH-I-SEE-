// ============================================================
// Quote Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');
const {
  createQuote, getUserQuotes, getAllQuotes, updateQuoteStatus, deleteQuote
} = require('../controllers/quoteController');

// GET /api/quotes/all — Admin: all quotes
router.get('/all', authenticate, isAdmin, getAllQuotes);

// GET /api/quotes — Authenticated user's quotes
router.get('/', authenticate, getUserQuotes);

// POST /api/quotes — Submit a bulk quote (auth optional but preferred)
router.post('/', authenticate, createQuote);

// PUT /api/quotes/:id/status — Admin: approve / reject
router.put('/:id/status', authenticate, isAdmin, updateQuoteStatus);

// DELETE /api/quotes/:id — Admin
router.delete('/:id', authenticate, isAdmin, deleteQuote);

module.exports = router;
