// ============================================================
// Middleware: Role-Based Access Control
// ============================================================

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    next();
  };
}

const isAdmin = requireRole('Admin', 'Super Admin');
const isPartner = requireRole('Partner', 'Admin', 'Super Admin');
const isCustomer = requireRole('Customer', 'Partner', 'Admin', 'Super Admin');

module.exports = { requireRole, isAdmin, isPartner, isCustomer };
