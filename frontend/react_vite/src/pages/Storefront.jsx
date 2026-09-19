import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const Storefront = () => {
  const { storeSubdomain } = useParams();
  const [storeConfig, setStoreConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app, this would fetch from the backend:
    // fetch(`/api/stores/config?store=${storeSubdomain}`)
    
    // Simulating an API call
    setTimeout(() => {
      setStoreConfig({
        name: `${storeSubdomain.charAt(0).toUpperCase() + storeSubdomain.slice(1)} Store`,
        theme: { primaryColor: '#2563eb' }
      });
      setLoading(false);
    }, 1000);
  }, [storeSubdomain]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading Store...</div>;

  return (
    <div style={{ '--color-primary': storeConfig.theme.primaryColor }} className="min-h-screen bg-white">
       <header className="h-16 flex items-center px-8 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
          <h1 className="text-2xl font-bold">{storeConfig.name}</h1>
       </header>
       <main className="p-8">
          <h2 className="text-3xl font-bold mb-6">Welcome to {storeConfig.name}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {/* Mock Products */}
             {[1,2,3].map(i => (
                <div key={i} className="border rounded-lg p-4 shadow-sm hover:shadow-md transition">
                   <div className="h-48 bg-gray-200 rounded-md mb-4"></div>
                   <h3 className="font-semibold text-lg">Product {i}</h3>
                   <p className="text-gray-600 mb-4">$99.99</p>
                   <button className="w-full py-2 text-white rounded" style={{ backgroundColor: 'var(--color-primary)' }}>
                     Add to Cart
                   </button>
                </div>
             ))}
          </div>
       </main>
    </div>
  );
};

export default Storefront;
