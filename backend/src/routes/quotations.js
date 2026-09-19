'use strict';
// ============================================================
// OH I SEE — Quotations Route
// Builder quotation upload, parsing and comparison
// ============================================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');
const { parseQuotationText, compareQuotations } = require('../services/quotationService');
let upload = { single: () => (req, res, next) => next() };
try {
  const multer = require('multer');
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
} catch (err) {
  console.warn('[Quotations] multer not installed, file upload endpoint disabled.');
}

// ── POST /api/quotations/parse — parse a quotation text/file
router.post('/parse', authenticate, async (req, res) => {
  try {
    const { rawText, builderName, projectId } = req.body;
    if (!rawText && !req.body.text) {
      return res.status(400).json({ error: 'rawText is required for parsing.' });
    }
    const text = rawText || req.body.text || '';
    const parsed = parseQuotationText(text, builderName || 'Builder');
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[Quotations] /parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse quotation.' });
  }
});

// ── POST /api/quotations/upload — upload and parse PDF/image
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { builderName = 'Builder', projectId } = req.body;
    let extractedText = '';

    // Try pdf-parse for PDF files
    if (req.file.mimetype === 'application/pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(req.file.buffer);
        extractedText = pdfData.text;
      } catch (pdfErr) {
        console.warn('[Quotations] pdf-parse error:', pdfErr.message);
        extractedText = '';
      }
    }

    // If image or pdf-parse failed, try Gemini vision
    if (!extractedText && process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        const result = await model.generateContent([
          { inlineData: { data: base64, mimeType } },
          `Extract all text from this builder quotation document. List every line item with description and amount. Return as plain text, one item per line.`
        ]);
        extractedText = result.response.text();
      } catch (geminiErr) {
        console.warn('[Quotations] Gemini vision error:', geminiErr.message);
      }
    }

    if (!extractedText) {
      return res.json({
        success: true,
        data: { builderName, totalAmount: 0, items: [], parseQuality: 'failed', requiresManualEntry: true },
        message: 'Could not extract text from this file. Please use manual entry.',
      });
    }

    const parsed = parseQuotationText(extractedText, builderName);

    // Save to DB if projectId provided
    if (projectId) {
      await supabase.from('builder_quotations').insert([{
        project_id: null, // will link on compare
        user_id: req.user.id,
        builder_name: builderName,
        total_amount: parsed.totalAmount,
        timeline_months: parsed.timelineMonths,
        raw_text: extractedText,
        extracted_scope: { items: parsed.items },
      }]);
    }

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[Quotations] /upload error:', err.message);
    res.status(500).json({ error: 'Failed to process uploaded file.' });
  }
});

// ── POST /api/quotations/compare — compare 2–3 quotations
router.post('/compare', authenticate, async (req, res) => {
  try {
    const { quotations, projectId } = req.body;
    if (!quotations || quotations.length < 2) {
      return res.status(400).json({ error: 'At least 2 quotations are required for comparison.' });
    }
    if (quotations.length > 4) {
      return res.status(400).json({ error: 'Maximum 4 quotations can be compared at once.' });
    }

    const result = compareQuotations(quotations);

    // Save comparison result to DB
    if (projectId) {
      try {
        await supabase.from('quote_comparisons').insert([{
          project_id: projectId,
          user_id: req.user.id,
          quote_ids: quotations.map(q => q.id || null),
          comparison_result: result,
          recommended_builder: result.bestValue,
          recommendation_reason: result.recommendation,
        }]);
      } catch (dbErr) {
        console.warn('[Quotations] DB save error:', dbErr.message);
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Quotations] /compare error:', err.message);
    res.status(500).json({ error: 'Failed to compare quotations.' });
  }
});

// ── POST /api/quotations — save a manual quotation
router.post('/', authenticate, async (req, res) => {
  try {
    const { projectId, builderName, companyName, totalAmount, timelineMonths, items = [], paymentTerms, warrantyPeriod, exclusions } = req.body;
    if (!builderName) return res.status(400).json({ error: 'Builder name is required.' });

    const { data, error } = await supabase.from('builder_quotations').insert([{
      project_id: projectId || null,
      user_id: req.user.id,
      builder_name: builderName,
      company_name: companyName || '',
      total_amount: parseFloat(totalAmount) || 0,
      timeline_months: parseInt(timelineMonths) || null,
      payment_terms: paymentTerms || '',
      warranty_period: warrantyPeriod || '',
      exclusions: exclusions || '',
      extracted_scope: { items },
    }]).select().single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[Quotations] POST error:', err.message);
    res.status(500).json({ error: 'Failed to save quotation.' });
  }
});

// ── GET /api/quotations — list user's quotations
router.get('/', authenticate, async (req, res) => {
  try {
    const { projectId } = req.query;
    let q = supabase.from('builder_quotations').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load quotations.' });
  }
});

module.exports = router;
