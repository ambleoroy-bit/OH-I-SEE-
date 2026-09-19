// GET /api/geo/ip — IP-based location fallback for login/signup
const express = require('express');
const router = express.Router();

router.get('/ip', async (req, res) => {
  try {
    const response = await fetch('https://ipwho.is/');
    const data = await response.json();
    if (!data?.success) {
      return res.status(503).json({ error: 'Could not detect location from network.' });
    }
    res.json({
      success: true,
      lat: data.latitude,
      lng: data.longitude,
      city: data.city || '',
      state: data.region || '',
      country: data.country || '',
      pincode: data.postal || '',
      display: [data.city, data.region, data.country].filter(Boolean).join(', '),
      source: 'ip'
    });
  } catch (err) {
    res.status(503).json({ error: 'Location service unavailable.' });
  }
});

module.exports = router;
