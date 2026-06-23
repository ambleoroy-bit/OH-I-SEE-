// ============================================================
// Orders Controller
// ============================================================
const supabase = require('../config/supabase');

function generateOrderId() {
  return 'OHI-' + Math.floor(Math.random() * 90000 + 10000);
}

// POST /api/orders — Place new order
async function createOrder(req, res) {
  try {
    const {
      items, subtotal, cgst, sgst, shipping = 0, discount = 0,
      discount_code = '', partner_savings = 0, total_amount,
      shipping_name, shipping_phone, shipping_address,
      shipping_city, shipping_state, shipping_pin,
      shipping_company = '', payment_method = 'upi', gstin = ''
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (!total_amount || total_amount <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }
    if (!shipping_name || !shipping_phone || !shipping_address) {
      return res.status(400).json({ error: 'Shipping details are required' });
    }

    const orderId = generateOrderId();

    const { data, error } = await supabase
      .from('orders')
      .insert([{
        order_id: orderId,
        user_id: req.user.id,
        items,
        subtotal: subtotal || 0,
        cgst: cgst || 0,
        sgst: sgst || 0,
        shipping,
        discount,
        discount_code,
        partner_savings,
        total_amount,
        order_status: 'processing',
        shipping_name,
        shipping_phone,
        shipping_address,
        shipping_city,
        shipping_state,
        shipping_pin,
        shipping_company,
        payment_method,
        gstin
      }])
      .select()
      .single();

    if (error) throw error;

    // Update product stock quantities
    for (const item of items) {
      if (item.product_id && item.quantity) {
        await supabase.rpc('decrement_stock', {
          p_id: item.product_id,
          qty: item.quantity
        }).catch(() => {}); // Non-blocking stock update
      }
    }

    // Clear the user's cart
    await supabase.from('cart').delete().eq('user_id', req.user.id);

    // Award reward points if Partner
    if (req.user.role === 'Partner' && req.user.partner_status === 'approved') {
      const points = Math.floor(total_amount / 100);
      await supabase.from('users').update({
        reward_points_total: (req.user.reward_points_total || 0) + points,
        reward_points_available: (req.user.reward_points_available || 0) + points,
        purchase_volume: (req.user.purchase_volume || 0) + total_amount,
        commission_pending: (req.user.commission_pending || 0) + Math.round(total_amount * 0.05)
      }).eq('id', req.user.id);
    }

    res.status(201).json({
      message: 'Order placed successfully',
      order: data,
      order_id: orderId
    });
  } catch (err) {
    console.error('createOrder error:', err);
    res.status(500).json({ error: err.message || 'Failed to place order' });
  }
}

// GET /api/orders — User's own orders
async function getUserOrders(req, res) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ orders: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

// GET /api/orders/:id — Single order
async function getOrder(req, res) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Order not found' });

    // Only owner or admin can view
    if (data.user_id !== req.user.id && !['Admin', 'Super Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ order: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
}

// GET /api/orders/all — Admin: all orders
async function getAllOrders(req, res) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('orders')
      .select(`*, users(name, email, company)`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('order_status', status);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ orders: data, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

// PUT /api/orders/:id/status — Admin: update order status
async function updateOrderStatus(req, res) {
  const { status } = req.body;
  const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ order_status: status })
      .eq('order_id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Order status updated', order: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
}

// GET /api/orders/stats — Admin dashboard stats
async function getOrderStats(req, res) {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('total_amount, order_status, created_at');

    if (error) throw error;

    const stats = {
      total_orders: orders.length,
      total_revenue: orders
        .filter(o => o.order_status !== 'cancelled')
        .reduce((s, o) => s + parseFloat(o.total_amount), 0),
      pending: orders.filter(o => ['pending', 'processing'].includes(o.order_status)).length,
      delivered: orders.filter(o => o.order_status === 'delivered').length,
      cancelled: orders.filter(o => o.order_status === 'cancelled').length
    };

    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

module.exports = { createOrder, getUserOrders, getOrder, getAllOrders, updateOrderStatus, getOrderStats };
