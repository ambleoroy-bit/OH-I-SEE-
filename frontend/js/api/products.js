// ============================================================
// OH I SEE — Products Frontend API client
// Maps database products to unified camelCase + snake_case structure
// ============================================================

function mapDbProductToFrontend(p) {
  if (!p) return null;
  const price = parseFloat(p.price);
  const originalPrice = p.original_price ? parseFloat(p.original_price) : null;
  const stockQty = p.stock_quantity || 0;
  
  return {
    id: p.id,
    name: p.product_name,
    product_name: p.product_name,
    brand: p.brand || '',
    category: p.category,
    sku: p.sku,
    description: p.description || '',
    price: price,
    originalPrice: originalPrice,
    original_price: originalPrice,
    image: p.image_url || '',
    image_url: p.image_url || '',
    stock: p.stock_status || 'instock',
    stock_status: p.stock_status || 'instock',
    stockQty: stockQty,
    stock_quantity: stockQty,
    badge: p.badge || 'instock',
    unit: p.unit || 'Pieces',
    gst_percent: p.gst_percent || 18,
    moq: p.moq || 1,
    specs: p.specs || {},
    is_active: p.is_active !== false,
    created_at: p.created_at,
    updated_at: p.updated_at
  };
}

window.ProductsAPI = {
  getAll: async () => {
    const res = await apiFetch('/products');
    const products = res.products || [];
    return products.map(mapDbProductToFrontend);
  },
  
  getById: async (id) => {
    const res = await apiFetch(`/products/${id}`);
    return mapDbProductToFrontend(res.product);
  },
  
  getAllAdmin: async () => {
    const res = await apiFetch('/products/admin/all');
    const products = res.products || [];
    return products.map(mapDbProductToFrontend);
  },
  
  create: async (data) => {
    return apiFetch('/products', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    });
  },
  
  update: async (id, data) => {
    return apiFetch(`/products/${id}`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    });
  },
  
  delete: async (id) => {
    return apiFetch(`/products/${id}`, { 
      method: 'DELETE' 
    });
  }
};
