// ============================================================
// Partners Controller
// ============================================================
const supabase = require('../config/supabase');

const TIER_DISCOUNTS = { Silver: 0.05, Gold: 0.10, Platinum: 0.15, Diamond: 0.20 };
const TIER_COMMISSION = { Silver: 0.03, Gold: 0.05, Platinum: 0.07, Diamond: 0.10 };

// GET /api/partners/me — Partner's own profile + benefits
async function getMyPartnerProfile(req, res) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    const tier = data.partner_tier || 'Silver';
    const benefits = {
      discount_percentage: Math.round((TIER_DISCOUNTS[tier] || 0.05) * 100),
      commission_percentage: Math.round((TIER_COMMISSION[tier] || 0.03) * 100),
      free_delivery: ['Gold', 'Platinum', 'Diamond'].includes(tier),
      insurance_eligible: ['Platinum', 'Diamond'].includes(tier),
      reward_points_multiplier: tier === 'Diamond' ? 3 : tier === 'Platinum' ? 2 : tier === 'Gold' ? 1.5 : 1
    };

    res.json({ partner: data, benefits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch partner profile' });
  }
}

// GET /api/partners — Admin: all partners
async function getAllPartners(req, res) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .eq('role', 'Partner')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('partner_status', status);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ partners: data, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch partners' });
  }
}

// PUT /api/partners/:id/status — Admin: approve/reject/suspend partner
async function updatePartnerStatus(req, res) {
  const { status, tier } = req.body;
  const validStatuses = ['pending', 'approved', 'rejected', 'suspended'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${validStatuses.join(', ')}` });
  }

  try {
    const updates = { partner_status: status };

    if (status === 'approved') {
      updates.insurance_status = 'Active';
      updates.insurance_policy_no = 'PIP-INS-' + Math.floor(Math.random() * 9000 + 1000);
    }
    if (tier) {
      updates.partner_tier = tier;
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: `Partner ${status}`, partner: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update partner status' });
  }
}

// PUT /api/partners/:id/tier — Admin: upgrade/downgrade tier
async function updatePartnerTier(req, res) {
  const { tier } = req.body;
  const validTiers = ['Silver', 'Gold', 'Platinum', 'Diamond'];

  if (!validTiers.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ partner_tier: tier })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: `Partner upgraded to ${tier}`, partner: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tier' });
  }
}

// POST /api/partners/redeem — Partner: redeem reward points
async function redeemPoints(req, res) {
  const { points_to_redeem } = req.body;

  if (!points_to_redeem || points_to_redeem < 100) {
    return res.status(400).json({ error: 'Minimum redemption is 100 points' });
  }

  const available = req.user.reward_points_available || 0;
  if (points_to_redeem > available) {
    return res.status(400).json({ error: `Insufficient points. Available: ${available}` });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        reward_points_available: available - points_to_redeem,
        reward_points_redeemed: (req.user.reward_points_redeemed || 0) + points_to_redeem
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    const discount_value = Math.floor(points_to_redeem / 10); // 10 points = ₹1
    res.json({
      message: `${points_to_redeem} points redeemed successfully`,
      discount_value,
      remaining_points: data.reward_points_available
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to redeem points' });
  }
}

module.exports = {
  getMyPartnerProfile, getAllPartners,
  updatePartnerStatus, updatePartnerTier, redeemPoints
};
