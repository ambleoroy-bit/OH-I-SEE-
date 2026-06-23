// ============================================================
// Users Controller
// ============================================================
const supabase = require('../config/supabase');

// GET /api/users/me
async function getMe(req, res) {
  res.json({ user: req.user });
}

// PUT /api/users/me — Update own profile
async function updateMe(req, res) {
  try {
    const allowedFields = ['name', 'phone', 'company', 'gstin', 'city', 'address', 'state', 'pincode'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Profile updated', user: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

// GET /api/users — Admin: all users
async function getAllUsers(req, res) {
  try {
    const { role, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('users')
      .select('id, name, email, phone, role, company, partner_status, partner_tier, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (role) query = query.eq('role', role);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ users: data, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

// GET /api/users/stats — Admin dashboard counters
async function getUserStats(req, res) {
  try {
    const { count: totalUsers } = await supabase
      .from('users').select('id', { count: 'exact', head: true });

    const { count: totalPartners } = await supabase
      .from('users').select('id', { count: 'exact', head: true }).eq('role', 'Partner');

    const { count: pendingPartners } = await supabase
      .from('users').select('id', { count: 'exact', head: true })
      .eq('role', 'Partner').eq('partner_status', 'pending');

    const { count: totalProducts } = await supabase
      .from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);

    const { count: lowStock } = await supabase
      .from('products').select('id', { count: 'exact', head: true })
      .eq('is_active', true).lte('stock_quantity', 25);

    const { count: totalOrders } = await supabase
      .from('orders').select('id', { count: 'exact', head: true });

    const { data: revenueData } = await supabase
      .from('orders').select('total_amount').neq('order_status', 'cancelled');

    const totalRevenue = (revenueData || []).reduce((s, o) => s + parseFloat(o.total_amount), 0);

    const { count: totalQuotes } = await supabase
      .from('bulk_quotes').select('id', { count: 'exact', head: true });

    const { count: pendingQuotes } = await supabase
      .from('bulk_quotes').select('id', { count: 'exact', head: true }).eq('quote_status', 'pending');

    res.json({
      stats: {
        totalUsers, totalPartners, pendingPartners,
        totalProducts, lowStock,
        totalOrders, totalRevenue,
        totalQuotes, pendingQuotes
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

// PUT /api/users/:id — Admin: update any user
async function updateUser(req, res) {
  try {
    const allowedFields = ['name', 'phone', 'role', 'company', 'city'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const { data, error } = await supabase
      .from('users').update(updates).eq('id', req.params.id).select().single();

    if (error) throw error;
    res.json({ message: 'User updated', user: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
}

module.exports = { getMe, updateMe, getAllUsers, getUserStats, updateUser };
