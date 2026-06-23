// ============================================================
// OH I SEE — Supabase Client & API Layer
// ============================================================
// SETUP: Replace these two values with your Supabase project credentials.
// Find them at: https://supabase.com/dashboard → Settings → API
// ============================================================

const SUPABASE_URL = 'https://vsqdqgmndgjfhosozxfn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TJJWAY3Xi6jrk2WlHKh_OA_fL-Y51XY';

// Initialize the Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

// ============================================================
// SESSION & AUTH HELPERS
// ============================================================
const SupabaseAuth = {
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getUserProfile(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
    return data;
  },

  // Sign in with email + password
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  // Sign up — role defaults to 'Customer'
  async signUp(email, password, name, role = 'Customer') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role }
      }
    });
    if (error) throw error;
    return data;
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Send password reset email
  async sendResetPasswordEmail(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login.html#reset`
    });
    if (error) throw error;
  },

  // Update password after reset
  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  // Update user profile in public.users table
  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Insert profile fields for partner registration
  async updatePartnerProfile(userId, partnerData) {
    const { data, error } = await supabase
      .from('users')
      .update({
        role: 'Partner',
        partner_status: 'pending',
        partner_tier: 'Silver',
        partner_type: partnerData.partnerType,
        company: partnerData.company,
        gst: partnerData.gst,
        pan: partnerData.pan,
        address: partnerData.address,
        city: partnerData.city,
        state: partnerData.state,
        pincode: partnerData.pincode,
        phone: partnerData.phone,
        insurance_status: 'Pending Review',
        insurance_policy_no: 'N/A',
        referral_code: 'OHI-' + Math.random().toString(36).toUpperCase().slice(2, 10),
        reward_points_available: 0,
        reward_points_total: 0,
        reward_points_redeemed: 0,
        purchase_volume: 0,
        commission_earned: 0,
        commission_pending: 0,
        commission_paid: 0
      })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};


// ============================================================
// PRODUCTS API
// ============================================================
const SupabaseProducts = {
  // Fetch all active products (or filtered by category)
  async fetchAll(category = null) {
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching products:', error);
      return [];
    }
    return data.map(mapProductFromDB);
  },

  // Fetch single product by ID
  async fetchById(id) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();
    if (error) return null;
    return mapProductFromDB(data);
  },

  // Create a new product (Admin only)
  async create(productData) {
    const { data, error } = await supabase
      .from('products')
      .insert([mapProductToDB(productData)])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Update existing product (Admin only)
  async update(id, productData) {
    const { data, error } = await supabase
      .from('products')
      .update(mapProductToDB(productData))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Soft-delete product (Admin only)
  async delete(id) {
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  },

  // Upload product image to Supabase Storage
  async uploadImage(file, productId) {
    const ext = file.name.split('.').pop();
    const fileName = `product-${productId}-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
    return urlData.publicUrl;
  },

  // Seed the database from the static products-data.js if the table is empty
  async seedIfEmpty() {
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true });

    if (count > 0) return;

    if (typeof PRODUCTS === 'undefined') return;

    console.log('Seeding products to Supabase...');
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < PRODUCTS.length; i += BATCH_SIZE) {
      batches.push(PRODUCTS.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      await supabase.from('products').insert(
        batch.map(p => ({
          product_name: p.name,
          brand: p.brand,
          category: mapCategory(p.category),
          sku: p.sku,
          description: p.description || '',
          price: p.price,
          original_price: p.originalPrice || null,
          image_url: p.image,
          stock_quantity: p.stockQty,
          stock_status: p.stock === 'instock' ? 'instock' : p.stock === 'limited' ? 'limited' : 'outofstock',
          badge: p.badge || 'instock',
          unit: p.specs?.Unit || 'Pieces',
          gst_percent: p.specs?.GST ? parseInt(p.specs.GST) : 18,
          moq: p.specs?.MOQ ? parseInt(p.specs.MOQ) : 1,
          specs: p.specs || {},
          is_active: true
        }))
      );
    }
    console.log('✓ Products seeded successfully.');
  }
};


// ============================================================
// CART API
// ============================================================
const SupabaseCart = {
  async fetchItems(userId) {
    const { data, error } = await supabase
      .from('cart')
      .select(`
        id,
        quantity,
        product_id,
        products (
          id, product_name, brand, sku, price, original_price,
          image_url, stock_quantity, stock_status, category
        )
      `)
      .eq('user_id', userId);
    if (error) return [];
    return data;
  },

  async addItem(userId, productId, quantity = 1) {
    const { data, error } = await supabase
      .from('cart')
      .upsert(
        { user_id: userId, product_id: productId, quantity },
        { onConflict: 'user_id,product_id', ignoreDuplicates: false }
      )
      .select();
    if (error) throw error;
    return data;
  },

  async incrementItem(userId, productId, delta = 1) {
    // Upsert with increment logic via RPC or fetch-then-upsert
    const { data: existing } = await supabase
      .from('cart')
      .select('quantity')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single();

    const newQty = existing ? existing.quantity + delta : delta;
    return this.addItem(userId, productId, Math.max(1, newQty));
  },

  async updateQty(userId, productId, quantity) {
    if (quantity < 1) return this.removeItem(userId, productId);
    const { error } = await supabase
      .from('cart')
      .update({ quantity })
      .eq('user_id', userId)
      .eq('product_id', productId);
    if (error) throw error;
  },

  async removeItem(userId, productId) {
    const { error } = await supabase
      .from('cart')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
    if (error) throw error;
  },

  async clearCart(userId) {
    const { error } = await supabase
      .from('cart')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  }
};


// ============================================================
// ORDERS API
// ============================================================
const SupabaseOrders = {
  async createOrder(userId, orderData) {
    const orderId = 'OHI-' + Math.floor(Math.random() * 90000 + 10000);
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        order_id: orderId,
        user_id: userId,
        items: orderData.items,
        subtotal: orderData.subtotal || 0,
        cgst: orderData.cgst || 0,
        sgst: orderData.sgst || 0,
        shipping: orderData.shipping || 0,
        discount: orderData.discount || 0,
        discount_code: orderData.discountCode || '',
        partner_savings: orderData.partnerSavings || 0,
        total_amount: orderData.grandTotal,
        order_status: 'processing',
        shipping_name: orderData.shippingName,
        shipping_phone: orderData.shippingPhone,
        shipping_address: orderData.shippingAddress,
        shipping_city: orderData.shippingCity,
        shipping_state: orderData.shippingState,
        shipping_pin: orderData.shippingPin,
        shipping_company: orderData.shippingCompany,
        payment_method: orderData.paymentMethod,
        gstin: orderData.gstin
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async fetchUserOrders(userId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data;
  },

  async fetchAllOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select(`*, users(name, email, company)`)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data;
  },

  async fetchOrderById(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    if (error) return null;
    return data;
  },

  async updateStatus(orderId, status) {
    const { error } = await supabase
      .from('orders')
      .update({ order_status: status })
      .eq('order_id', orderId);
    if (error) throw error;
  }
};


// ============================================================
// BULK QUOTES API
// ============================================================
const SupabaseQuotes = {
  async createQuote(userId, quoteData) {
    const quoteId = 'QTE-' + Math.floor(Math.random() * 90000 + 10000);
    const { data, error } = await supabase
      .from('bulk_quotes')
      .insert([{
        quote_id: quoteId,
        user_id: userId,
        customer_name: quoteData.contactName,
        email: quoteData.email,
        phone: quoteData.phone,
        company_name: quoteData.company,
        gstin: quoteData.gstin || '',
        project_name: quoteData.projectName,
        location: quoteData.location,
        budget: quoteData.budget,
        timeline: quoteData.timeline,
        items: quoteData.items,
        specs_notes: quoteData.specsNotes || '',
        quote_status: 'pending'
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async fetchUserQuotes(userId) {
    const { data, error } = await supabase
      .from('bulk_quotes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data;
  },

  async fetchAllQuotes() {
    const { data, error } = await supabase
      .from('bulk_quotes')
      .select(`*, users(name, email, company)`)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data;
  },

  async updateStatus(quoteId, status) {
    const { error } = await supabase
      .from('bulk_quotes')
      .update({ quote_status: status })
      .eq('quote_id', quoteId);
    if (error) throw error;
  }
};


// ============================================================
// ADMIN: PARTNER MANAGEMENT API
// ============================================================
const SupabasePartners = {
  async fetchAll() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'Partner')
      .order('created_at', { ascending: false });
    if (error) return [];
    return data;
  },

  async updateStatus(userId, status) {
    const updates = { partner_status: status };
    if (status === 'approved') {
      updates.insurance_status = 'Active';
      updates.insurance_policy_no = 'PIP-INS-' + Math.floor(Math.random() * 9000 + 1000);
    }
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);
    if (error) throw error;
  },

  async upgradeTier(userId, currentTier) {
    const tiers = ['Silver', 'Gold', 'Platinum', 'Diamond'];
    const idx = tiers.indexOf(currentTier || 'Silver');
    const nextTier = tiers[(idx + 1) % tiers.length];
    const { error } = await supabase
      .from('users')
      .update({ partner_tier: nextTier })
      .eq('id', userId);
    if (error) throw error;
    return nextTier;
  },

  async redeemPoints(userId, cost, currentPoints) {
    if (currentPoints < cost) throw new Error('Insufficient reward points');
    const newPoints = currentPoints - cost;
    const { error } = await supabase
      .from('users')
      .update({
        reward_points_available: newPoints,
        reward_points_redeemed: supabase.rpc ? undefined : undefined
      })
      .eq('id', userId);
    if (error) throw error;
    return newPoints;
  }
};


// ============================================================
// MAPPING HELPERS — Convert between DB snake_case and app camelCase
// ============================================================
function mapProductFromDB(p) {
  return {
    id: p.id,
    name: p.product_name,
    brand: p.brand,
    category: p.category,
    sku: p.sku,
    description: p.description,
    price: parseFloat(p.price),
    originalPrice: p.original_price ? parseFloat(p.original_price) : null,
    image: p.image_url || getCategoryFallbackImage(p.category),
    stockQty: p.stock_quantity,
    stock: p.stock_status,
    badge: p.badge,
    specs: {
      ...(p.specs || {}),
      Unit: p.unit,
      GST: p.gst_percent + '%',
      MOQ: String(p.moq || 1)
    }
  };
}

function mapProductToDB(p) {
  return {
    product_name: p.name,
    brand: p.brand || '',
    category: mapCategory(p.category),
    sku: p.sku,
    description: p.description || '',
    price: parseFloat(p.price),
    original_price: p.originalPrice ? parseFloat(p.originalPrice) : null,
    image_url: p.image_url || p.image || '',
    stock_quantity: parseInt(p.stockQty || p.stock_quantity || 0),
    stock_status: p.stock === 'instock' || p.stock === 'active' ? 'instock'
                : p.stock === 'outofstock' ? 'outofstock'
                : p.stock === 'inactive' ? 'inactive' : 'limited',
    badge: p.badge || 'instock',
    unit: p.specs?.Unit || p.unit || 'Pieces',
    gst_percent: p.specs?.GST ? parseInt(p.specs.GST) : (p.gst_percent || 18),
    moq: p.specs?.MOQ ? parseInt(p.specs.MOQ) : (p.moq || 1),
    specs: p.specs || {},
    is_active: true
  };
}

function mapCategory(cat) {
  const allowed = [
    'Electrical', 'Plumbing', 'Hardware', 'Industrial',
    'Pipes', 'Pipe Fittings', 'Valves', 'Reducers', 'Bushes',
    'Brass Fittings', 'Bathroom Fittings', 'Bathroom Accessories',
    'CPVC Products', 'UPVC Products', 'Industrial Tools'
  ];
  return allowed.includes(cat) ? cat : 'Plumbing';
}

function getCategoryFallbackImage(category) {
  if (category === 'Electrical') return '/images/cat-electrical.png';
  if (category === 'Hardware') return '/images/cat-hardware.png';
  if (category === 'Industrial' || category === 'Industrial Tools') return '/images/cat-industrial.png';
  return '/images/cat-plumbing.png';
}


// ============================================================
// GLOBAL PRODUCT CACHE — Keeps products available to all page scripts
// ============================================================
window.SupabaseProductCache = {
  products: null,

  async load(forceRefresh = false) {
    if (!forceRefresh && this.products) return this.products;

    this.products = await SupabaseProducts.fetchAll();

    // Dispatch event so other scripts can react
    window.dispatchEvent(new CustomEvent('supabaseProductsLoaded', {
      detail: { products: this.products }
    }));

    return this.products;
  },

  get() {
    return this.products || (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []);
  }
};


// ============================================================
// AUTO-BOOTSTRAP: Seed products + load cache on page load
// ============================================================
(async function bootstrap() {
  try {
    await SupabaseProducts.seedIfEmpty();
    await window.SupabaseProductCache.load();
  } catch (err) {
    console.warn('Supabase bootstrap warning (continuing with static data):', err.message);
  }
})();
