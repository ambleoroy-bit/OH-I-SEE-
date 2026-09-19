import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'preserve-classic-scripts',
    generateBundle() {
      const visit = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) visit(file);
          else if (entry.name.endsWith('.js')) this.emitFile({ type: 'asset', fileName: file.replaceAll('\\', '/'), source: fs.readFileSync(file) });
        }
      };
      visit('js');
    }
  }],
  server: {
    port: 3000,
    strictPort: true,
    open: '/pages/index.html',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: './pages/index.html',
        quoteCompare: './pages/quote-compare.html',
        supplierDashboard: './pages/supplier-dashboard.html',
        vendorDashboard: './pages/vendor-dashboard.html',
        products: './pages/products.html',
        productDetail: './pages/product-detail.html',
        cart: './pages/cart.html',
        checkout: './pages/checkout.html',
        login: './pages/login.html',
        account: './pages/account.html',
        admin: './pages/admin.html',
        partner: './pages/partner.html',
        quote: './pages/bulk-quote.html',
        about: './pages/about.html',
        contact: './pages/contact.html',
        projectDetail: './pages/project-detail.html',
        projectOverview: './pages/project-overview.html',
        projectBim: './pages/project-bim.html',
        project3d: './pages/project-3d.html',
        projectFloorPlan: './pages/project-floor-plan.html',
        projectBoq: './pages/project-boq.html',
        projectCost: './pages/project-cost.html',
        projectMaterials: './pages/project-materials.html',
        projectExport: './pages/project-export.html',
        services: './pages/services.html',
        enterprise: './pages/enterprise.html',
        projectWizard: './pages/project-wizard.html',
        intentEngine: './pages/intent-engine.html',
        customerPortal: './pages/customer-portal.html',
        visualizer3d: './pages/visualizer-3d.html',
        blueprintBuilder: './pages/blueprint-builder.html',
        vendorOnboarding: './pages/vendor-onboarding.html',
        orderConfirmation: './pages/order-confirmation.html'
      }
    }
  }
});

