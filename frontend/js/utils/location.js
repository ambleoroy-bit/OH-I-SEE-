// OH I SEE — Browser location helper (GPS + IP fallback + reverse geocode)
(function (global) {
  const STORAGE_KEY = 'ohisee_detected_location';
  const SUPPORTED_CITIES = [
    'Coimbatore', 'Chennai', 'Bangalore', 'Madurai', 'Salem', 'Trichy', 'Kochi', 'Hyderabad'
  ];
  const SUPPORTED_STATES = ['Tamil Nadu', 'Karnataka', 'Kerala', 'Telangana'];
  const STATE_ALIASES = {
    'tamil nadu': 'Tamil Nadu',
    'tamilnadu': 'Tamil Nadu',
    'karnataka': 'Karnataka',
    'kerala': 'Kerala',
    'telangana': 'Telangana'
  };

  let cached = null;
  let inflight = null;

  function normalize(text) {
    return String(text || '').trim().toLowerCase();
  }

  function matchSupportedCity(...names) {
    for (const raw of names) {
      const name = normalize(raw);
      if (!name) continue;
      const hit = SUPPORTED_CITIES.find((city) => {
        const c = city.toLowerCase();
        return name.includes(c) || c.includes(name);
      });
      if (hit) return hit;
    }
    return '';
  }

  function matchSupportedState(...names) {
    for (const raw of names) {
      const key = normalize(raw);
      if (!key) continue;
      if (STATE_ALIASES[key]) return STATE_ALIASES[key];
      const hit = SUPPORTED_STATES.find((s) => key === s.toLowerCase() || key.includes(s.toLowerCase()));
      if (hit) return hit;
    }
    return '';
  }

  function readCache() {
    if (cached) return cached;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) cached = JSON.parse(stored);
    } catch (_) {}
    return cached;
  }

  function saveCache(data) {
    if (data?.status !== 'ok') return;
    cached = data;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function clearCache() {
    cached = null;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function buildLocationPayload(lat, lng, geo, source) {
    const city = matchSupportedCity(
      geo.city,
      geo.locality,
      geo.principalSubdivision,
      geo.localityInfo?.administrative?.[2]?.name,
      geo.localityInfo?.administrative?.[3]?.name
    );
    const state = matchSupportedState(
      geo.principalSubdivision,
      geo.administrative?.[1]?.name,
      geo.localityInfo?.administrative?.[1]?.name
    ) || '';
    const locality = geo.locality || geo.city || geo.localityName || '';
    const display = [locality, city, state].filter(Boolean).join(', ')
      || geo.city
      || geo.countryName
      || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;

    return {
      status: 'ok',
      lat: Number(lat),
      lng: Number(lng),
      city,
      state,
      pincode: geo.postcode || geo.postalCode || '',
      locality,
      display,
      source,
      via: source === 'gps' ? 'GPS' : 'Network',
      detected_at: new Date().toISOString()
    };
  }

  async function reverseGeocode(lat, lng, source = 'gps') {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('reverse failed');
      const data = await res.json();
      return buildLocationPayload(lat, lng, data, source);
    } catch (_) {
      return {
        status: 'ok',
        lat: Number(lat),
        lng: Number(lng),
        city: '',
        state: '',
        pincode: '',
        locality: '',
        display: `Near ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
        source,
        via: source === 'gps' ? 'GPS' : 'Network',
        detected_at: new Date().toISOString()
      };
    }
  }

  function apiBase() {
    const host = global.location?.hostname || '';
    if (typeof resolveOhiseeApiBase === 'function') return resolveOhiseeApiBase();
    return (host === 'localhost' || host === '127.0.0.1')
      ? ((location.port === '3000' || location.port === '5173') ? '/api' : 'http://127.0.0.1:3001/api')
      : '/api';
  }

  async function fetchIpFromBackend() {
    const res = await fetch(`${apiBase()}/geo/ip`);
    if (!res.ok) throw new Error('backend ip failed');
    const data = await res.json();
    if (!data.success) throw new Error('backend ip failed');
    return buildLocationPayload(data.lat, data.lng, {
      city: data.city,
      locality: data.city,
      principalSubdivision: data.state,
      postcode: data.pincode,
      countryName: data.country
    }, 'ip');
  }

  async function fetchIpFromPublic() {
    const res = await fetch('https://ipwho.is/');
    if (!res.ok) throw new Error('IP location unavailable');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'IP lookup failed');
    return buildLocationPayload(data.latitude, data.longitude, {
      city: data.city,
      locality: data.city,
      principalSubdivision: data.region,
      postcode: data.postal,
      countryName: data.country
    }, 'ip');
  }

  async function fetchIpLocation() {
    try {
      return await fetchIpFromBackend();
    } catch (_) {
      return await fetchIpFromPublic();
    }
  }

  function gpsErrorMessage(code) {
    if (code === 1) {
      return {
        title: 'Location permission blocked',
        detail: 'Click the lock icon in the address bar → Site settings → Allow Location, then tap Retry.',
        action: 'Enable GPS'
      };
    }
    if (code === 2) {
      return {
        title: 'GPS is turned off',
        detail: 'Turn on Location in Windows Settings → Privacy → Location, then tap Retry.',
        action: 'Turn On GPS'
      };
    }
    if (code === 3) {
      return {
        title: 'GPS signal weak',
        detail: 'Trying network-based location instead. Tap Retry if this persists.',
        action: 'Retry GPS'
      };
    }
    return {
      title: 'Location unavailable',
      detail: 'Allow location permission or tap Retry to detect via network.',
      action: 'Retry'
    };
  }

  function getPositionOnce(options) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(Object.assign(new Error('Geolocation not supported'), { code: 0 }));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function getPositionRobust() {
    if (!navigator.geolocation) return null;

    const strategies = [
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 }
    ];

    let lastError = null;
    for (const opts of strategies) {
      try {
        const pos = await getPositionOnce(opts);
        if (pos?.coords?.latitude != null && pos?.coords?.longitude != null) return pos;
      } catch (err) {
        lastError = err;
        if (err.code === 1) throw err;
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  async function fetchLocation(force = false) {
    if (!force) {
      const existing = readCache();
      if (existing?.status === 'ok') return existing;
    } else {
      clearCache();
    }

    if (inflight) return inflight;

    inflight = (async () => {
      try {
        let payload = null;

        try {
          const pos = await getPositionRobust();
          if (pos) {
            payload = await reverseGeocode(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy > 5000 ? 'network' : 'gps'
            );
          }
        } catch (gpsErr) {
          if (gpsErr.code === 1) throw gpsErr;
        }

        if (!payload) {
          payload = await fetchIpLocation();
        }

        saveCache(payload);
        return payload;
      } catch (err) {
        try {
          const ipPayload = await fetchIpLocation();
          saveCache(ipPayload);
          return ipPayload;
        } catch (_) {}

        return {
          status: 'error',
          code: err.code ?? 0,
          message: err.message || 'Location unavailable',
          ...gpsErrorMessage(err.code ?? 0),
          detected_at: new Date().toISOString()
        };
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }

  function applyToSignupForm(location) {
    if (!location || location.status !== 'ok') return;
    const cityEl = document.getElementById('reg-city');
    const stateEl = document.getElementById('reg-state');
    if (cityEl && location.city) {
      const hasOption = Array.from(cityEl.options).some((o) => o.value === location.city);
      if (hasOption) cityEl.value = location.city;
    }
    if (stateEl && location.state) {
      const hasState = Array.from(stateEl.options).some((o) => o.value === location.state);
      if (hasState) stateEl.value = location.state;
    }
  }

  function renderAuthLocationBar(location, els) {
    if (!els?.bar) return;
    els.bar.style.display = 'flex';
    els.bar.classList.remove('is-loading', 'is-ok', 'is-error');

    if (!location) {
      els.bar.classList.add('is-loading');
      if (els.label) els.label.textContent = 'Detecting your location…';
      if (els.detail) els.detail.textContent = 'Using GPS or network location. Allow access if prompted.';
      if (els.retry) els.retry.style.display = 'none';
      return;
    }

    if (location.status === 'ok') {
      els.bar.classList.add('is-ok');
      if (els.label) els.label.textContent = `Location detected (${location.via || 'GPS'})`;
      if (els.detail) els.detail.textContent = location.display;
      if (els.retry) {
        els.retry.style.display = 'inline-flex';
        els.retry.textContent = 'Refresh';
      }
      applyToSignupForm(location);
      return;
    }

    els.bar.classList.add('is-error');
    if (els.label) els.label.textContent = location.title || 'Location unavailable';
    if (els.detail) els.detail.textContent = location.detail || location.message;
    if (els.retry) {
      els.retry.style.display = 'inline-flex';
      els.retry.textContent = location.action || 'Retry';
    }
  }

  async function initAuthLocationUI(options = {}) {
    const els = {
      bar: document.getElementById(options.barId || 'auth-location-bar'),
      label: document.getElementById(options.labelId || 'auth-location-label'),
      detail: document.getElementById(options.detailId || 'auth-location-detail'),
      retry: document.getElementById(options.retryId || 'auth-location-retry')
    };
    if (!els.bar) return null;

    const run = async (force) => {
      renderAuthLocationBar(null, els);
      const result = await fetchLocation(force);
      renderAuthLocationBar(result, els);
      return result;
    };

    if (!els.retry?.dataset.bound) {
      els.retry.dataset.bound = '1';
      els.retry.addEventListener('click', () => run(true));
    }

    const cachedLoc = readCache();
    if (cachedLoc?.status === 'ok') {
      renderAuthLocationBar(cachedLoc, els);
      applyToSignupForm(cachedLoc);
      return { refresh: () => run(true), get: readCache };
    }

    await run(false);
    return { refresh: () => run(true), get: readCache };
  }

  global.OhiseeLocation = {
    fetchLocation,
    readCache,
    clearCache,
    applyToSignupForm,
    initAuthLocationUI,
    getPayload() {
      const loc = readCache();
      if (!loc || loc.status !== 'ok') return null;
      return {
        lat: loc.lat,
        lng: loc.lng,
        city: loc.city,
        state: loc.state,
        pincode: loc.pincode,
        display: loc.display,
        source: loc.source
      };
    }
  };
})(window);
