// ============================================================
// Products Controller
// ============================================================
const { validationResult } = require('express-validator');
const supabase = require('../config/supabase');

// GET /api/products
async function getProducts(req, res) {
  try {
    const { category, search, min_price, max_price, stock, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) query = query.eq('category', category);
    if (stock) query = query.eq('stock_status', stock);
    if (min_price) query = query.gte('price', Number(min_price));
    if (max_price) query = query.lte('price', Number(max_price));
    if (search) query = query.ilike('product_name', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ products: data, total: count, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    console.error('getProducts error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
}

// GET /api/products/:id
async function getProduct(req, res) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .eq('is_active', true)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}

// POST /api/products (Admin only)
async function createProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(err => err.msg).join(', ');
    return res.status(400).json({ error: errorMsg, errors: errors.array() });
  }

  try {
    const {
      product_name, brand = '', category, sku, description = '',
      price, original_price, image_url = '', stock_quantity = 0,
      stock_status = 'instock', badge = 'instock', unit = 'Pieces',
      gst_percent = 18, moq = 1, specs = {}
    } = req.body;

    const { data, error } = await supabase
      .from('products')
      .insert([{
        product_name, brand, category, sku, description, price,
        original_price: original_price || null, image_url, stock_quantity,
        stock_status, badge, unit, gst_percent, moq, specs, is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: 'Product created', product: data });
  } catch (err) {
    console.error('createProduct error:', err);
    res.status(500).json({ error: err.message || 'Failed to create product' });
  }
}

// PUT /api/products/:id (Admin only)
async function updateProduct(req, res) {
  try {
    const updates = { ...req.body };
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Product updated', product: data });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update product' });
  }
}

// DELETE /api/products/:id (Admin only — soft delete)
async function deleteProduct(req, res) {
  try {
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

// GET /api/products/admin/all (Admin — includes inactive)
async function getAllProductsAdmin(req, res) {
  try {
    const { data, error, count } = await supabase
      .from('products')
      .select('*', { count: 'exact' })
      .order('id', { ascending: false });

    if (error) throw error;
    res.json({ products: data, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
}

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct, getAllProductsAdmin };
