// ============================================================
// Store Controller (SaaS Multi-Tenancy)
// ============================================================
const supabase = require('../config/supabase');

// POST /api/stores/onboard (Public - SaaS Signup)
async function createStore(req, res) {
  try {
    const { store_name, subdomain, theme_config } = req.body;

    if (!store_name || !subdomain) {
      return res.status(400).json({ error: 'Store name and subdomain are required' });
    }

    // Usually we would create the user first, or this is called AFTER user signup
    // Let's assume the user is authenticated and this is step 2 of onboarding.
    if (!req.user || !req.user.id) {
       return res.status(401).json({ error: 'Authentication required to create a store' });
    }

    // Check if subdomain is available
    const { data: existing } = await supabase
      .from('stores')
      .select('id')
      .eq('subdomain', subdomain)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Subdomain is already taken' });
    }

    const { data: store, error } = await supabase
      .from('stores')
      .insert([{
        name: store_name,
        subdomain,
        owner_id: req.user.id,
        theme_config: theme_config || {
          primaryColor: '#000000',
          secondaryColor: '#ffffff',
          fontFamily: 'Inter, sans-serif'
        }
      }])
      .select()
      .single();

    if (error) throw error;
    
    // Upgrade user role to Store Owner if they are just a 'Customer'
    if (req.user.role === 'Customer') {
       await supabase.from('users').update({ role: 'Store Owner' }).eq('id', req.user.id);
    }

    res.status(201).json({ message: 'Store created successfully', store });
  } catch (err) {
    console.error('createStore error:', err);
    res.status(500).json({ error: err.message || 'Failed to create store' });
  }
}

// GET /api/stores/config (Public - For Storefront)
// Uses tenant identification to know which store to fetch
async function getStoreConfig(req, res) {
  try {
    if (!req.storeId) {
      return res.status(400).json({ error: 'Store context is missing' });
    }

    const { data: store, error } = await supabase
      .from('stores')
      .select('name, subdomain, custom_domain, theme_config, status')
      .eq('id', req.storeId)
      .single();

    if (error || !store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json({ store });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch store configuration' });
  }
}

// PUT /api/stores/config (Admin - Update store settings)
async function updateStoreConfig(req, res) {
  try {
    if (!req.storeId) {
      return res.status(400).json({ error: 'Store context is missing' });
    }

    const updates = { ...req.body };
    delete updates.id;
    delete updates.owner_id;
    delete updates.subdomain; // Prevent subdomain changes here for safety

    const { data: store, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', req.storeId)
      .eq('owner_id', req.user.id) // Ensure only owner can update
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Store updated', store });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update store configuration' });
  }
}

module.exports = {
  createStore,
  getStoreConfig,
  updateStoreConfig
};
