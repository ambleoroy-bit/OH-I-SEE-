const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');
const { detectConstructionIntent, getQuestionsForIntent, getNextQuestion, buildProjectPayload } = require('../services/intentEngine');

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, history, projectContext } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const response = await aiService.handleChat(message, history, projectContext);
    res.json(response);
  } catch (error) {
    console.error('AI Chat Error:', error.message);
    res.status(503).json({ 
      type: 'error', 
      text: 'Sorry, the AI assistant is temporarily unavailable. Please try again shortly.' 
    });
  }
});

// POST /api/ai/vision
router.post('/vision', async (req, res) => {
  try {
    const { image } = req.body; // base64 image
    if (!image) return res.status(400).json({ error: 'Image is required' });

    const response = await aiService.analyzeImage(image);
    res.json(response);
  } catch (error) {
    console.error('AI Vision Error:', error.message);
    res.status(503).json({ 
      type: 'error', 
      text: 'Sorry, the vision service is temporarily unavailable. Please try again shortly.' 
    });
  }
});

// POST /api/ai/visualize
router.post('/visualize', async (req, res) => {
  try {
    const { image, productIds } = req.body;
    if (!image || !productIds || !productIds.length) {
      return res.status(400).json({ error: 'Image and productIds are required' });
    }

    const response = await aiService.visualizeProducts(image, productIds);
    res.json(response);
  } catch (error) {
    console.error('AI Visualization Error:', error.message);
    res.status(503).json({ 
      success: false, 
      error: 'Sorry, the visualization service is temporarily unavailable. Please try again shortly.' 
    });
  }
});

// POST /api/ai/boq — Generate BOQ for a project (authenticated)
router.post('/boq', authenticate, async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    // Fetch project and verify ownership
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (projErr || !project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const boq = await aiService.generateBOQ(project);

    // Persist the BOQ to the project row and update progress
    const { error: saveError } = await supabase
      .from('projects')
      .update({
        boq_data: boq,
        progress_boq: 80,
        progress_estimate: 60,
        current_stage: 'BOQ'
      })
      .eq('project_id', projectId)
      .eq('user_id', req.user.id);

    if (saveError) throw saveError;
    res.json({ success: true, boq });
  } catch (error) {
    console.error('AI BOQ Error:', error.message);
    res.status(503).json({ error: 'BOQ generation temporarily unavailable. Please try again.' });
  }
});

// POST /api/ai/intent — detect construction intent from natural language
router.post('/intent', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const intent = detectConstructionIntent(message);
    if (!intent) {
      return res.json({
        success: true,
        intent: null,
        message: 'No specific construction intent detected. Use the AI assistant for general queries.'
      });
    }

    const questions = getQuestionsForIntent(intent);
    const intentLabels = {
      NEW_HOME: 'New Home Builder',
      RENOVATION: 'Home Renovation',
      ELECTRICAL: 'Electrical & Lighting',
      PRODUCT_SEARCH: 'Product Finder',
      QUOTE_COMPARE: 'Builder Quote Comparator',
      BLUEPRINT: 'AI Blueprint Builder',
      VISUALIZER_3D: '2D → 3D Visualizer',
    };

    res.json({
      success: true,
      intent,
      intentLabel: intentLabels[intent] || intent,
      totalQuestions: questions.filter(q => !q.optional).length,
      firstQuestion: questions[0],
      redirectUrl: `/pages/intent-engine.html?intent=${intent}`,
    });
  } catch (err) {
    console.error('[AI] /intent error:', err.message);
    res.status(500).json({ error: 'Intent detection failed.' });
  }
});

// POST /api/ai/question — get next question for a given intent
router.post('/question', async (req, res) => {
  try {
    const { intent, answers = {} } = req.body;
    if (!intent) return res.status(400).json({ error: 'intent is required' });

    const nextQ = getNextQuestion(intent, answers);
    const questions = getQuestionsForIntent(intent);
    const answeredCount = questions.filter(q => !q.optional && answers[q.key] !== undefined && answers[q.key] !== '').length;
    const totalRequired = questions.filter(q => !q.optional).length;

    res.json({
      success: true,
      question: nextQ,
      isComplete: nextQ === null,
      progress: { answered: answeredCount, total: totalRequired },
    });
  } catch (err) {
    console.error('[AI] /question error:', err.message);
    res.status(500).json({ error: 'Failed to get next question.' });
  }
});

module.exports = router;
