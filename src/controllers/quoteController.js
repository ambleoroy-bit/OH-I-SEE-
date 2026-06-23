// ============================================================
// Bulk Quotes Controller
// ============================================================
const supabase = require('../config/supabase');

function generateQuoteId() {
  return 'QTE-' + Math.floor(Math.random() * 90000 + 10000);
}

// POST /api/quotes — Submit bulk quote
async function createQuote(req, res) {
  try {
    const {
      customer_name, email, phone, company_name, gstin = '',
      project_name, location, budget, timeline,
      items = [], specs_notes = ''
    } = req.body;

    if (!customer_name || !email || !phone || !company_name || !project_name || !location) {
      return res.status(400).json({ error: 'Please fill all required fields' });
    }

    const quoteId = generateQuoteId();

    const { data, error } = await supabase
      .from('bulk_quotes')
      .insert([{
        quote_id: quoteId,
        user_id: req.user?.id || null,
        customer_name,
        email: email.toLowerCase(),
        phone,
        company_name,
        gstin,
        project_name,
        location,
        budget: budget || '',
        timeline: timeline || '',
        items: Array.isArray(items) ? items : [],
        specs_notes,
        quote_status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Quote submitted successfully. Our team will contact you within 24 hours.',
      quote: data,
      quote_id: quoteId
    });
  } catch (err) {
    console.error('createQuote error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit quote' });
  }
}

// GET /api/quotes — User's own quotes
async function getUserQuotes(req, res) {
  try {
    const { data, error } = await supabase
      .from('bulk_quotes')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ quotes: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
}

// GET /api/quotes/all — Admin: all quotes
async function getAllQuotes(req, res) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('bulk_quotes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('quote_status', status);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ quotes: data, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
}

// PUT /api/quotes/:id/status — Admin: approve / reject / deliver
async function updateQuoteStatus(req, res) {
  const { status } = req.body;
  const validStatuses = ['pending', 'reviewing', 'delivered', 'rejected'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
  }

  try {
    const { data, error } = await supabase
      .from('bulk_quotes')
      .update({ quote_status: status })
      .eq('quote_id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Quote status updated', quote: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quote' });
  }
}

// DELETE /api/quotes/:id — Admin: delete quote
async function deleteQuote(req, res) {
  try {
    const { error } = await supabase
      .from('bulk_quotes')
      .delete()
      .eq('quote_id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Quote deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete quote' });
  }
}

module.exports = { createQuote, getUserQuotes, getAllQuotes, updateQuoteStatus, deleteQuote };
