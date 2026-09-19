// ============================================
// OH I SEE — AI Assistant Floating Widget
// ============================================

class AIAssistant {
  constructor() {
    this.isOpen = false;
    this.history = [];
    this.selectedImage = null;
    this.init();
  }

  init() {
    this.renderUI();
    this.bindEvents();
    this.addMessage("Hi! I'm your <strong>OH I SEE AI Assistant</strong> 👋<br><br>What are you looking for today?", 'bot');
    this.renderQuickActions();
  }

  renderUI() {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="ai-fab" id="ai-fab" title="Chat with AI Assistant">✨</div>
      <div class="ai-window" id="ai-window">
        <div class="ai-header">
          <div class="ai-header-title">
            <span class="ai-header-status"></span>
            OH I SEE Assistant
          </div>
          <button class="ai-close-btn" id="ai-close-btn">✕</button>
        </div>
        <div class="ai-history" id="ai-history"></div>
        <div class="ai-image-preview" id="ai-image-preview">
          <img src="" id="ai-preview-img" alt="Upload preview">
          <button class="ai-preview-close" id="ai-preview-close">✕</button>
          <span style="font-size:12px;color:#666;">Image attached</span>
        </div>
        <div class="ai-input-area">
          <label class="ai-image-upload" title="Upload an image">
            📷
            <input type="file" id="ai-file-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
          </label>
          <input type="text" class="ai-input" id="ai-input" placeholder="Ask about products, projects, or upload a photo...">
          <button class="ai-send-btn" id="ai-send-btn" title="Send">➤</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    this.fab              = document.getElementById('ai-fab');
    this.window           = document.getElementById('ai-window');
    this.closeBtn         = document.getElementById('ai-close-btn');
    this.historyContainer = document.getElementById('ai-history');
    this.input            = document.getElementById('ai-input');
    this.sendBtn          = document.getElementById('ai-send-btn');
    this.fileInput        = document.getElementById('ai-file-input');
    this.imagePreview     = document.getElementById('ai-image-preview');
    this.previewImg       = document.getElementById('ai-preview-img');
    this.previewClose     = document.getElementById('ai-preview-close');
  }

  bindEvents() {
    this.fab.addEventListener('click', () => this.toggleWindow());
    this.closeBtn.addEventListener('click', () => this.toggleWindow());
    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.input.addEventListener('keypress', e => { if (e.key === 'Enter') this.handleSend(); });
    this.fileInput.addEventListener('change', e => this.handleImageUpload(e));
    this.previewClose.addEventListener('click', () => this.clearImage());
  }

  toggleWindow() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.window.classList.add('open');
      this.fab.style.display = 'none';
      setTimeout(() => this.input.focus(), 300);
    } else {
      this.window.classList.remove('open');
      this.fab.style.display = 'flex';
    }
  }

  renderQuickActions() {
    const actions = ['Find Products', 'Build My Project', 'Upload an Image', 'Help Me Choose'];
    const container = document.createElement('div');
    container.className = 'ai-quick-actions';
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'ai-quick-btn';
      btn.textContent = action;
      btn.onclick = () => {
        if (action === 'Upload an Image') {
          this.fileInput.click();
        } else {
          this.input.value = action;
          this.handleSend();
        }
        container.remove();
      };
      container.appendChild(btn);
    });
    this.historyContainer.appendChild(container);
    this.scrollToBottom();
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be smaller than 5MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      this.selectedImage = e.target.result;
      this.previewImg.src = this.selectedImage;
      this.imagePreview.classList.add('active');
      this.input.placeholder = 'Add a message about this image...';
    };
    reader.readAsDataURL(file);
  }

  clearImage() {
    this.selectedImage = null;
    this.fileInput.value = '';
    this.imagePreview.classList.remove('active');
    this.input.placeholder = 'Ask about products, projects, or upload a photo...';
  }

  async handleSend() {
    const text = this.input.value.trim();
    if (!text && !this.selectedImage) return;

    this.input.value = '';
    let userMsg = text;
    if (this.selectedImage) {
      userMsg = `<img src="${this.selectedImage}" style="max-width:100%;border-radius:8px;margin-bottom:8px;display:block;"><br>${text}`;
    }
    this.addMessage(userMsg || 'Analyzed Image', 'user');

    const imageToSend = this.selectedImage;
    const textToSend  = text;
    this.clearImage();

    const typingId = this.showTyping();

    try {
      let response;
      if (imageToSend) {
        response = await window.AiAPI.analyzeImage(imageToSend);
      } else {
        response = await window.AiAPI.sendMessage(textToSend, this.history);
        this.history.push({ role: 'user', content: textToSend });
      }

      this.removeTyping(typingId);

      if (response.type === 'error') {
        this.addMessage(`<span style="color:#d32f2f;">${response.text}</span>`, 'bot');
        return;
      }

      if (response.text) {
        const formatted = response.text
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br>');
        this.addMessage(formatted, 'bot');
        this.history.push({ role: 'assistant', content: response.text });
      }

      if (response.chips && response.chips.length) {
        this.renderChips(response.chips);
      }

      if (response.type === 'products' && response.data) {
        this.renderProducts(response.data);
      } else if (response.type === 'comparison' && response.data) {
        this.renderComparison(response.data);
      } else if (response.type === 'project' && response.data) {
        this.renderProject(response.data);
      }

    } catch (error) {
      this.removeTyping(typingId);
      this.addMessage("<span style='color:#d32f2f;'>Sorry, the assistant is temporarily unavailable. Please try again.</span>", 'bot');
    }
  }

  addMessage(content, sender) {
    const div = document.createElement('div');
    div.className = `ai-msg ${sender}`;
    div.innerHTML = content;
    this.historyContainer.appendChild(div);
    this.scrollToBottom();
  }

  renderChips(chips) {
    const container = document.createElement('div');
    container.className = 'ai-quick-actions';
    container.style.marginTop = '0';

    const actionMap = {
      'Open New Home Builder →': 'intent-engine.html?intent=NEW_HOME',
      'Open Home Renovation →': 'intent-engine.html?intent=RENOVATION',
      'Open Electrical & Lighting →': 'intent-engine.html?intent=ELECTRICAL',
      'Open Quote Comparator →': 'quote-compare.html',
      'Open AI Blueprint Builder →': 'blueprint-builder.html',
      'Open 2D → 3D Visualizer →': 'visualizer-3d.html',
      'Open Product Finder →': 'products.html',
      'Build New Home →': 'intent-engine.html?intent=NEW_HOME',
      'Renovate My Home →': 'intent-engine.html?intent=RENOVATION',
    };

    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'ai-quick-btn';
      btn.textContent = chip;
      btn.onclick = () => {
        container.remove();
        if (actionMap[chip]) {
          window.location.href = actionMap[chip];
          return;
        }
        if (chip.startsWith('Open ') && chip.includes('→')) {
          const lower = chip.toLowerCase();
          if (lower.includes('home')) window.location.href = 'intent-engine.html?intent=NEW_HOME';
          else if (lower.includes('renovat')) window.location.href = 'intent-engine.html?intent=RENOVATION';
          else if (lower.includes('electric')) window.location.href = 'intent-engine.html?intent=ELECTRICAL';
          else if (lower.includes('quote')) window.location.href = 'quote-compare.html';
          else if (lower.includes('blueprint')) window.location.href = 'blueprint-builder.html';
          else if (lower.includes('3d') || lower.includes('visual')) window.location.href = 'visualizer-3d.html';
          else if (lower.includes('product')) window.location.href = 'products.html';
          return;
        }
        this.input.value = chip;
        this.handleSend();
      };
      container.appendChild(btn);
    });
    this.historyContainer.appendChild(container);
    this.scrollToBottom();
  }

  renderProducts(products) {
    if (!products || !products.length) return;
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

    products.forEach(p => {
      const card = document.createElement('div');
      card.className = 'ai-product-card';
      const img = p.image || '/images/logo.png';
      card.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;">
          <img src="${img}" onerror="this.src='/images/logo.png'"
            style="width:56px;height:56px;object-fit:contain;border-radius:6px;background:#f5f5f5;flex-shrink:0;">
          <div class="ai-product-info" style="flex:1;min-width:0;">
            <div class="ai-product-title">${(p.name || '').replace(/</g, '&lt;')}</div>
            <div style="font-size:11px;color:#666;">${(p.brand || '').replace(/</g, '&lt;')}</div>
            <div class="ai-product-price">₹${Number(p.price || 0).toLocaleString('en-IN')}</div>
          </div>
        </div>
        <div class="ai-product-actions">
          <button class="ai-btn ai-btn-primary"
            onclick="if(typeof Cart!=='undefined'&&Cart.addItem){Cart.addItem(${p.id});this.textContent='Added ✓';this.style.background='#00A651';setTimeout(()=>{this.textContent='Add to Cart';this.style.background='';},2000);}else{window.location.href='product-detail.html?id=${p.id}';}">
            Add to Cart
          </button>
          <button class="ai-btn ai-btn-outline"
            onclick="window.location.href='product-detail.html?id=${p.id}'">
            View
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    this.historyContainer.appendChild(container);
    this.scrollToBottom();
  }

  renderComparison(products) {
    if (!products || products.length < 2) return;
    const container = document.createElement('div');
    container.className = 'ai-comparison-table-wrapper';
    const thead = `<tr><th>Feature</th>${products.map(p => `<th>${(p.product_name || p.name || '').replace(/</g, '&lt;')}</th>`).join('')}</tr>`;
    const tbody = `
      <tr><td><strong>Price</strong></td>${products.map(p => `<td>₹${Number(p.price || 0).toLocaleString('en-IN')}</td>`).join('')}</tr>
      <tr><td><strong>Brand</strong></td>${products.map(p => `<td>${(p.brand || '-').replace(/</g, '&lt;')}</td>`).join('')}</tr>
      <tr><td><strong>Stock</strong></td>${products.map(p => `<td>${(p.stock_quantity || 0) > 0 ? 'In Stock' : 'Out of Stock'}</td>`).join('')}</tr>`;
    container.innerHTML = `<table class="ai-comparison-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    this.historyContainer.appendChild(container);
    this.scrollToBottom();
  }

  renderProject(projectData) {
    if (!projectData || !projectData.items || !projectData.items.length) return;
    const safeType = (projectData.projectType || '').replace(/</g, '&lt;');
    const btnId    = `ai-add-all-${Date.now()}`;
    const container = document.createElement('div');
    container.className = 'ai-project-card';
    container.innerHTML = `
      <div class="ai-project-header"><h4>${safeType} PROJECT</h4></div>
      <div class="ai-project-items">
        ${projectData.items.map(item => `
          <div class="ai-project-item">
            <span class="ai-project-item-name">${(item.name || '').replace(/</g, '&lt;')} × ${item.quantity || 1}</span>
            <span class="ai-project-item-price">₹${Number((item.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}</span>
          </div>`).join('')}
      </div>
      <div class="ai-project-total">
        <span>Estimated Total:</span>
        <span>₹${Number(projectData.estimatedTotal || 0).toLocaleString('en-IN')}</span>
      </div>
      <div style="padding:12px;">
        <button class="ai-btn ai-btn-primary" style="width:100%;" id="${btnId}">Add All to Cart</button>
      </div>`;
    this.historyContainer.appendChild(container);

    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        projectData.items.forEach(item => {
          if (typeof Cart !== 'undefined' && Cart.addItem) Cart.addItem(item.id, item.quantity || 1);
        });
        btn.textContent = 'Added ✓';
        btn.style.background = '#00A651';
      });
    }
    this.scrollToBottom();
  }

  showTyping() {
    const id  = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'ai-typing';
    div.id = id;
    div.innerHTML = '<div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>';
    this.historyContainer.appendChild(div);
    this.scrollToBottom();
    return id;
  }

  removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  scrollToBottom() {
    this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.OHISEE_AI = new AIAssistant();
});
