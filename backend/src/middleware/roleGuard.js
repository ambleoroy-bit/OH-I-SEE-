// ============================================================
// Middleware: Role-Based Access Control (RBAC)
// ============================================================

function normalizeRole(role) {
  if (!role) return '';
  return role.toUpperCase().replace(/\s+/g, '_');
}

function requireRole(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = normalizeRole(req.user.role || 'CUSTOMER');

    // Super Admin and Admin always pass
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      return next();
    }

    if (normalizedAllowed.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied for role '${req.user.role}'. Allowed roles: ${allowedRoles.join(', ')}`
    });
  };
}

const isAdmin = requireRole('ADMIN', 'SUPER_ADMIN');
const isPartner = requireRole('PARTNER', 'ADMIN', 'SUPER_ADMIN');
const isCustomer = requireRole('CUSTOMER', 'PARTNER', 'ADMIN', 'SUPER_ADMIN');
const isProcurement = requireRole('PROCUREMENT_MANAGER', 'PURCHASE_MANAGER', 'ADMIN', 'SUPER_ADMIN');
const isSupplier = requireRole('SUPPLIER', 'VENDOR', 'ADMIN', 'SUPER_ADMIN');
const isFinance = requireRole('FINANCE_MANAGER', 'ADMIN', 'SUPER_ADMIN');
const isQuality = requireRole('QUALITY_MANAGER', 'ADMIN', 'SUPER_ADMIN');
const isLogistics = requireRole('LOGISTICS_MANAGER', 'WAREHOUSE_MANAGER', 'ADMIN', 'SUPER_ADMIN');
const isEnterprise = requireRole(
  'SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'PROCUREMENT_MANAGER', 
  'PURCHASE_MANAGER', 'SUPPLIER', 'VENDOR', 'CONTRACTOR', 'SUB_CONTRACTOR', 
  'LOGISTICS_MANAGER', 'WAREHOUSE_MANAGER', 'FINANCE_MANAGER', 'QUALITY_MANAGER'
);

module.exports = {
  requireRole,
  normalizeRole,
  isAdmin,
  isPartner,
  isCustomer,
  isProcurement,
  isSupplier,
  isFinance,
  isQuality,
  isLogistics,
  isEnterprise
};
