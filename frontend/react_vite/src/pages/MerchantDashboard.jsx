import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';

const DashboardHome = () => <div className="p-6"><h2 className="text-2xl font-bold">Overview</h2><p>Welcome to your merchant dashboard.</p></div>;
const ProductsManage = () => <div className="p-6"><h2 className="text-2xl font-bold">Products</h2><p>Manage your inventory here.</p></div>;
const OrdersManage = () => <div className="p-6"><h2 className="text-2xl font-bold">Orders</h2><p>View and process customer orders.</p></div>;

const MerchantDashboard = () => {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-slate-800">
          Store Admin
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/admin" className="block px-4 py-2 rounded hover:bg-slate-800">Dashboard</Link>
          <Link to="/admin/products" className="block px-4 py-2 rounded hover:bg-slate-800">Products</Link>
          <Link to="/admin/orders" className="block px-4 py-2 rounded hover:bg-slate-800">Orders</Link>
          <Link to="/admin/settings" className="block px-4 py-2 rounded hover:bg-slate-800">Settings</Link>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-800">Merchant Dashboard</h1>
          <div className="flex items-center space-x-4">
             <button className="text-sm font-medium text-blue-600 hover:underline">View Live Store</button>
             <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/products" element={<ProductsManage />} />
            <Route path="/orders" element={<OrdersManage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default MerchantDashboard;
