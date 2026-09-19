const supabase = require('../config/supabase');

/**
 * Searches the OH I SEE product catalog based on user natural language request.
 */
async function searchProducts({ category, query, minPrice, maxPrice, limit = 5 }) {
  try {
    let dbQuery = supabase
      .from('products')
      .select('id, product_name, brand, category, price, stock_quantity, stock_status, image_url, description, specs')
      .eq('is_active', true);
    
    if (category) {
      dbQuery = dbQuery.ilike('category', `%${category}%`);
    }
    
    if (query) {
      dbQuery = dbQuery.ilike('product_name', `%${query}%`);
    }
    
    if (minPrice !== undefined) dbQuery = dbQuery.gte('price', minPrice);
    if (maxPrice !== undefined) dbQuery = dbQuery.lte('price', maxPrice);
    
    const { data, error } = await dbQuery.limit(limit);
    if (error) throw error;
    
    return data.map(p => ({
      id: p.id,
      name: p.product_name,
      brand: p.brand,
      category: p.category,
      price: p.price,
      stock: p.stock_quantity > 0 ? `${p.stock_quantity} In Stock` : 'Out of Stock',
      image: p.image_url,
      specs: p.specs
    }));
  } catch (error) {
    console.error('searchProducts Error:', error);
    return [];
  }
}

/**
 * Retrieves specific products for comparison.
 */
async function compareProducts({ productIds }) {
  try {
    if (!productIds || productIds.length === 0) return [];
    
    const { data, error } = await supabase
      .from('products')
      .select('id, product_name, brand, price, specs, stock_quantity')
      .in('id', productIds)
      .eq('is_active', true);
      
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('compareProducts Error:', error);
    return [];
  }
}

/**
 * Builds a multi-category project shopping list.
 */
async function buildProjectList({ projectType, requirements }) {
  // This is a simplified logic. In a real scenario, you'd map requirements to categories
  // For the sake of this robust implementation, we fetch top items from relevant categories
  try {
    const categoriesToFetch = ['Electrical', 'Plumbing', 'Hardware', 'IndustrialTools'];
    let projectItems = [];
    let estimatedTotal = 0;

    for (const cat of categoriesToFetch) {
      // Just fetching 2 top products per category as a generic "project kit"
      // The LLM will decide which ones to present based on the actual request
      const { data } = await supabase
        .from('products')
        .select('id, product_name, price, category, image_url')
        .ilike('category', `%${cat}%`)
        .eq('is_active', true)
        .limit(2);
        
      if (data && data.length > 0) {
        data.forEach(item => {
          projectItems.push({
            id: item.id,
            name: item.product_name,
            category: item.category,
            price: item.price,
            image: item.image_url,
            quantity: 1 // Default suggested qty
          });
          estimatedTotal += item.price;
        });
      }
    }
    
    return {
      projectType,
      items: projectItems,
      estimatedTotal
    };
  } catch (error) {
    console.error('buildProjectList Error:', error);
    return { items: [], estimatedTotal: 0 };
  }
}

module.exports = {
  searchProducts,
  compareProducts,
  buildProjectList
};
