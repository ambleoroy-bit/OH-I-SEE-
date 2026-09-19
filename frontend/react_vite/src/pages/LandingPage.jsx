import React from 'react';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="max-w-4xl text-center px-4">
        <h1 className="text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">
          Launch Your E-Commerce Empire <span className="text-blue-600">Without Coding</span>
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          The ultimate multi-tenant platform for groceries, electronics, fashion, and industrial supplies.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
            Start Free Trial
          </button>
          <button className="px-8 py-3 bg-white text-gray-800 rounded-lg font-semibold border border-gray-200 hover:bg-gray-50 transition">
            View Demo Stores
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
