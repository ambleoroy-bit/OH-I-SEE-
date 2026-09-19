// Admin Add Product Logic
document.addEventListener('DOMContentLoaded', () => {
  // Check if Admin
  const token = localStorage.getItem('supabase_token');
  // For the sake of this feature, we simulate role check by decoding JWT or fetching profile
  // Assuming 'app.js' or global state can confirm admin. We'll do a simple check.
  // In a real app, verify role via backend endpoint or JWT claims.
  const checkAdmin = async () => {
    if (!token) return;
    try {
      const res = await fetch('http://localhost:5000/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.role === 'admin' || data.role === 'superadmin') {
        const adminBtn = document.getElementById('admin-add-product-container');
        if (adminBtn) adminBtn.style.display = 'block';
      }
    } catch (err) {
      console.error('Failed to check admin status', err);
    }
  };
  checkAdmin();

  // Modal Elements
  const modal = document.getElementById('add-product-modal');
  const btnOpen = document.getElementById('btn-open-add-product');
  const btnClose = document.getElementById('btn-close-add-product');
  
  if(btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      modal.classList.add('active');
    });
    btnClose.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  // Specifications Dynamic Fields
  const specsContainer = document.getElementById('specs-container');
  const btnAddSpec = document.getElementById('btn-add-spec');
  
  if (btnAddSpec) {
    btnAddSpec.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'spec-row';
      row.innerHTML = `
        <input type="text" placeholder="Key (e.g. Size)" class="spec-key">
        <input type="text" placeholder="Value (e.g. Medium)" class="spec-value">
        <button type="button" class="btn-remove-spec">✕</button>
      `;
      specsContainer.appendChild(row);
      
      row.querySelector('.btn-remove-spec').addEventListener('click', () => {
        row.remove();
      });
    });
  }

  // Pre-bind existing remove buttons
  document.querySelectorAll('.btn-remove-spec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.spec-row').remove();
    });
  });

  // Image Upload Logic (Mocked Preview)
  const imageInput = document.getElementById('ap-images');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  let selectedFiles = [];

  if (imageInput) {
    imageInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (selectedFiles.length + files.length > 10) {
        if(window.showToast) window.showToast('Maximum 10 images allowed', 'error');
        return;
      }
      
      files.forEach(file => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          if(window.showToast) window.showToast('Only JPG, PNG, WEBP allowed', 'error');
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          if(window.showToast) window.showToast('Image must be under 10MB', 'error');
          return;
        }

        selectedFiles.push(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'image-preview-wrapper';
          wrapper.innerHTML = `
            <img src="${e.target.result}" alt="Preview">
            <button type="button" class="remove-img" data-name="${file.name}">✕</button>
          `;
          imagePreviewContainer.appendChild(wrapper);

          wrapper.querySelector('.remove-img').addEventListener('click', (e) => {
            const fileName = e.target.getAttribute('data-name');
            selectedFiles = selectedFiles.filter(f => f.name !== fileName);
            wrapper.remove();
          });
        };
        reader.readAsDataURL(file);
      });
    });
  }

  // Submit Logic
  const getFormData = (visible) => {
    const specs = {};
    document.querySelectorAll('.spec-row').forEach(row => {
      const key = row.querySelector('.spec-key').value.trim();
      const val = row.querySelector('.spec-value').value.trim();
      if (key && val) specs[key] = val;
    });

    // We convert specs back to what the backend expects (JSONB object or array based on schema)
    // The backend `specs` field is a JSON object.
    
    return {
      product_name: document.getElementById('ap-name').value,
      category: document.getElementById('ap-category').value,
      brand: document.getElementById('ap-brand').value,
      sku: document.getElementById('ap-sku').value,
      hsn_code: document.getElementById('ap-hsn').value,
      model_number: document.getElementById('ap-model').value,
      short_description: document.getElementById('ap-short-desc').value,
      price: parseFloat(document.getElementById('ap-price').value),
      original_price: parseFloat(document.getElementById('ap-mrp').value) || 0,
      cost_price: parseFloat(document.getElementById('ap-cost').value) || 0,
      gst_percent: parseFloat(document.getElementById('ap-gst').value),
      moq: parseInt(document.getElementById('ap-moq').value),
      unit: document.getElementById('ap-unit').value,
      stock_quantity: parseInt(document.getElementById('ap-stock').value) || 0,
      stock_status: document.getElementById('ap-stock-status').value,
      specs: specs,
      visible: visible
    };
  };

  const submitProduct = async (visible) => {
    if (!token) return window.showToast('Please login as admin first', 'error');

    const data = getFormData(visible);
    
    // Basic validation
    if (!data.product_name || !data.category || !data.brand || isNaN(data.price)) {
      return window.showToast('Please fill all required fields correctly', 'error');
    }
    if (data.price < 0 || data.stock_quantity < 0) {
      return window.showToast('Price and Stock cannot be negative', 'error');
    }

    try {
      const res = await fetch('http://localhost:5000/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error || 'Failed to add product');
      
      window.showToast(`Product ${visible ? 'Published' : 'Frozen'} Successfully`, 'success');
      modal.classList.remove('active');
      document.getElementById('add-product-form').reset();
      imagePreviewContainer.innerHTML = '';
      selectedFiles = [];

      // If published, refresh product grid
      if (visible && typeof window.loadProducts === 'function') {
        window.loadProducts();
      }

    } catch (err) {
      window.showToast(err.message, 'error');
    }
  };

  const btnPublish = document.getElementById('btn-publish-product');
  const btnFreeze = document.getElementById('btn-freeze-product');

  if (btnPublish) btnPublish.addEventListener('click', () => submitProduct(true));
  if (btnFreeze) btnFreeze.addEventListener('click', () => submitProduct(false));
});
