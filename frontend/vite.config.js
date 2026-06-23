import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: '/pages/index.html' // Automatically opens index.html on start
  },
  build: {
    rollupOptions: {
      input: {
        main: './pages/index.html',
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
        contact: './pages/contact.html'
      }
    }
  }
});
