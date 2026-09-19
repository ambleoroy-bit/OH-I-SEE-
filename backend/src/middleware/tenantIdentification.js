// ============================================================
// Tenant Identification Middleware
// Determines which store a request belongs to.
// ============================================================
const supabaseAdmin = require('../config/supabase');

const identifyTenant = async (req, res, next) => {
  try {
    // 1. Try to get store_id from explicit header (used by Merchant Dashboard)
    const headerStoreId = req.headers['x-store-id'];
    if (headerStoreId) {
      req.storeId = headerStoreId;
      return next();
    }

    // 2. Identify by origin/host (used by Storefront)
    const origin = req.headers.origin;
    const host = req.headers.host;
    
    // In local development, we might not have proper subdomains setup easily,
    // so we can also check for a query parameter or custom header for testing.
    const testStore = req.query.store;
    if (testStore) {
        // Find store by subdomain
        const { data: store, error } = await supabaseAdmin
            .from('stores')
            .select('id')
            .eq('subdomain', testStore)
            .single();
            
        if (store) {
            req.storeId = store.id;
            return next();
        }
    }

    // Parse domain
    let domain = null;
    if (origin) {
      try {
        const url = new URL(origin);
        domain = url.hostname;
      } catch (e) {
        domain = origin;
      }
    } else if (host) {
      domain = host.split(':')[0];
    }

    if (domain) {
      // Exclude platform main domains
      const platformDomains = ['localhost', '127.0.0.1', process.env.PLATFORM_DOMAIN];
      
      if (!platformDomains.includes(domain)) {
         // It might be a custom domain or subdomain
         // e.g. "freshmart.ourplatform.com" -> subdomain is "freshmart"
         let isSubdomain = false;
         let subdomainStr = '';
         
         if (process.env.PLATFORM_DOMAIN && domain.endsWith(`.${process.env.PLATFORM_DOMAIN}`)) {
             isSubdomain = true;
             subdomainStr = domain.replace(`.${process.env.PLATFORM_DOMAIN}`, '');
         } else if (domain !== 'localhost' && domain !== '127.0.0.1') {
             // Local testing fallback: if domain is freshmart.localhost
             if (domain.endsWith('.localhost')) {
                 isSubdomain = true;
                 subdomainStr = domain.replace('.localhost', '');
             }
         }

         let query = supabaseAdmin.from('stores').select('id, status');
         
         if (isSubdomain) {
             query = query.eq('subdomain', subdomainStr);
         } else {
             query = query.eq('custom_domain', domain);
         }

         const { data: store, error } = await query.single();

         if (store) {
            if (store.status !== 'active') {
                return res.status(403).json({ error: 'Store is inactive' });
            }
            req.storeId = store.id;
            return next();
         }
      }
    }

    // If we reach here, we couldn't identify the tenant.
    // For some routes (like platform admin or public SaaS pages), this is fine.
    // We'll let the controller decide if storeId is mandatory.
    next();
  } catch (error) {
    console.error('Tenant Identification Error:', error);
    res.status(500).json({ error: 'Internal server error identifying store' });
  }
};

const requireTenant = (req, res, next) => {
    if (!req.storeId) {
        return res.status(400).json({ error: 'Store identification required' });
    }
    next();
}

module.exports = {
  identifyTenant,
  requireTenant
};
