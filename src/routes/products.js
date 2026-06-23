// ============================================================
// Product Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');
const {
  getProducts, getProduct, createProduct,
  updateProduct, deleteProduct, getAllProductsAdmin
} = require('../controllers/productController');

// GET /api/products — Public: all active products
router.get('/', getProducts);

// GET /api/products/admin/all — Admin: all including inactive
router.get('/admin/all', authenticate, isAdmin, getAllProductsAdmin);

// GET /api/products/:id — Public
router.get('/:id', getProduct);

// POST /api/products — Admin only
router.post('/', authenticate, isAdmin, [
  body('product_name').trim().notEmpty().withMessage('Product name is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('price').isFloat({ min: 0.01 }).withMessage('Price must be positive'),
  body('stock_quantity').isInt({ min: 0 }).withMessage('Stock must be non-negative')
], createProduct);

// PUT /api/products/:id — Admin only
router.put('/:id', authenticate, isAdmin, updateProduct);

// DELETE /api/products/:id — Admin only
router.delete('/:id', authenticate, isAdmin, deleteProduct);

module.exports = router;
