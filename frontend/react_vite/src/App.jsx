import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import MerchantDashboard from './pages/MerchantDashboard';
import Storefront from './pages/Storefront';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin/*" element={<MerchantDashboard />} />
        {/* Dynamic Storefront - realistically handled via subdomains in prod, but for local dev we might use a parameter or rely on host parsing in a higher component */}
        <Route path="/store/:storeSubdomain/*" element={<Storefront />} />
      </Routes>
    </Router>
  );
}

export default App;
