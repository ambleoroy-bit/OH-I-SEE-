// ============================================
// AI API Client
// ============================================

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3001/api' 
  : '/api';

function getAuthHeaders() {
  const token = typeof TokenStore !== 'undefined' ? TokenStore.get() : (localStorage.getItem('ohisee_jwt') || localStorage.getItem('ohisee_token'));
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const AiAPI = {
  async sendMessage(message, history = [], projectContext = null) {
    try {
      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message, history, projectContext })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('AI Chat Error:', error);
      throw error;
    }
  },

  async analyzeImage(base64Image) {
    try {
      const response = await fetch(`${API_BASE_URL}/ai/vision`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ image: base64Image })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('AI Vision Error:', error);
      throw error;
    }
  },

  async visualizeProducts(base64Image, productIds) {
    try {
      const response = await fetch(`${API_BASE_URL}/ai/visualize`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ image: base64Image, productIds })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('AI Visualization Error:', error);
      throw error;
    }
  },

  async generateBOQ(projectId) {
    try {
      const response = await fetch(`${API_BASE_URL}/ai/boq`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ projectId })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate BOQ');
      }
      return await response.json();
    } catch (error) {
      console.error('AI BOQ Error:', error);
      throw error;
    }
  }
};

window.AiAPI = AiAPI;
