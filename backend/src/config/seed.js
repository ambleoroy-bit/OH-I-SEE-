// ============================================================
// OH I SEE — Backend Database Seeder
// Seeds mock products into public.products using Supabase Service Key
// ============================================================
const supabase = require('./supabase');
const path = require('path');

// Import PRODUCTS from frontend/js/products-data
let PRODUCTS = [];
try {
  const productsDataPath = path.resolve(__dirname, '../../../frontend/js/products-data');
  const productsModule = require(productsDataPath);
  PRODUCTS = productsModule.PRODUCTS;
  console.log(`✓ Loaded ${PRODUCTS.length} templates for auto-seeding.`);
} catch (err) {
  console.error('⚠ Failed to require products-data.js directly:', err.message);
}

const { seedEnterpriseDemoData } = require('./seed_v2');

async function seedProductsIfEmpty() {
  try {
    if (!PRODUCTS || !PRODUCTS.length) {
      console.error('⚠ Seeding skipped: no PRODUCTS data loaded from products-data.js');
      return;
    }

    console.log('Checking database product records...');
    const { count, error: countError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('⚠ Error checking product count in database:', countError);
      return;
    }

    console.log(`✓ Database current product count: ${count}`);

    if (count === 0) {
      console.log(`Seeding ${PRODUCTS.length} products into public.products...`);

      const dbProducts = PRODUCTS.map(p => ({
        id: p.id,
        product_name: p.name,
        brand: p.brand || '',
        category: p.category,
        sku: p.sku,
        description: p.description || '',
        price: p.price,
        original_price: p.originalPrice || null,
        image_url: p.image || '',
        stock_quantity: p.stockQty || 0,
        stock_status: p.stock || 'instock',
        badge: p.badge || 'instock',
        unit: p.unit || 'Pieces',
        gst_percent: p.gst_percent || 18,
        moq: p.moq || 1,
        specs: p.specs || {},
        is_active: true
      }));

      // Insert in chunks of 50 to avoid potential payload size limits
      const chunkSize = 50;
      for (let i = 0; i < dbProducts.length; i += chunkSize) {
        const chunk = dbProducts.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('products')
          .insert(chunk);

        if (insertError) {
          console.error(`⚠ Failed to insert chunk starting at index ${i}:`, insertError);
          throw insertError;
        }
      }

      console.log('✓ public.products database auto-seeded successfully.');
    } else {
      console.log('✓ Products table populated. Seeding not required.');
    }

    // Seed Enterprise Demo Data
    await seedEnterpriseDemoData();

  } catch (err) {
    console.error('⚠ Failed to auto-seed products catalog:', err);
  }
}

module.exports = { seedProductsIfEmpty };
