'use strict';
// ============================================================
// OH I SEE — Quotation Service
// Parses, normalizes and compares builder quotations
// ============================================================
const { SCOPE_CATEGORIES } = require('./intentEngine');

// ── Keyword → scope category mapping ─────────────────────
const SCOPE_KEYWORDS = {
  'Foundation & Excavation': ['foundation','excavation','earthwork','footing','plinth','basement'],
  'RCC Structure':           ['rcc','reinforced','concrete','beam','column','slab','structural','steel','reinforcement'],
  'Brickwork / Blockwork':   ['brick','block','masonry','brickwork','blockwork','hollow block','fly ash'],
  'Plastering':              ['plaster','plastering','putty','skim','internal finish'],
  'Flooring':                ['floor','tile','marble','granite','vitrified','flooring','lay tile'],
  'Painting (Interior)':     ['interior paint','inside paint','internal painting','wall paint','emulsion'],
  'Painting (Exterior)':     ['exterior paint','outside paint','external painting','weather coat','texture'],
  'Electrical Work':         ['electrical','wiring','wire','switch','socket','mcb','fan point','light point','power point','db box','electrical work','earthing'],
  'Plumbing Work':           ['plumbing','pipe','drainage','water supply','sewage','sanitary','cpvc','upvc','pvc pipe','sump','tank'],
  'Doors & Windows':         ['door','window','frame','shutter','upvc','aluminum window','wooden door','glass','grille'],
  'Kitchen Work':            ['kitchen','modular kitchen','counter','platform','kitchen fitting','sink','kitchen slab'],
  'Bathroom Work':           ['bathroom','toilet','wc','wash basin','shower','bathroom fitting','cp fitting','sanitary ware'],
  'Staircase':               ['stair','staircase','steps','handrail','railing'],
  'Terrace / Waterproofing': ['terrace','waterproof','roof','roofing','sunshade','parapet'],
  'External Works / Compound Wall': ['compound','boundary wall','external','gate','fencing','road','driveway','garden','landscaping'],
  'Other / Miscellaneous':   ['miscellaneous','other','misc','sundries','provisional','contingency'],
};

// ── Normalize a raw extracted line items array ────────────
function normalizeLineItems(items = []) {
  const normalized = {};
  for (const cat of SCOPE_CATEGORIES) normalized[cat] = { status: 'UNKNOWN', items: [], subtotal: 0 };

  for (const item of items) {
    const desc = (item.description || item.name || '').toLowerCase();
    let matched = false;
    for (const [cat, keywords] of Object.entries(SCOPE_KEYWORDS)) {
      if (keywords.some(kw => desc.includes(kw))) {
        normalized[cat].status = 'INCLUDED';
        normalized[cat].items.push(item);
        normalized[cat].subtotal += parseFloat(item.amount || item.total || 0);
        matched = true;
        break;
      }
    }
    if (!matched) {
      normalized['Other / Miscellaneous'].status = 'INCLUDED';
      normalized['Other / Miscellaneous'].items.push(item);
      normalized['Other / Miscellaneous'].subtotal += parseFloat(item.amount || item.total || 0);
    }
  }

  return normalized;
}

// ── Parse raw quotation text (from PDF extraction) ────────
function parseQuotationText(rawText, builderName = 'Builder') {
  if (!rawText || rawText.trim().length < 10) {
    return { builderName, totalAmount: 0, items: [], rawText, parseQuality: 'failed' };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  let totalAmount = 0;
  let timelineMonths = null;

  // Extract total
  for (const line of lines) {
    const totalMatch = line.match(/total[^₹\d]*(₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/i);
    if (totalMatch) {
      const val = parseFloat(totalMatch[2].replace(/,/g, ''));
      if (val > totalAmount) totalAmount = val;
    }
    // Timeline
    const timeMatch = line.match(/(\d+)\s*(?:months?|mths?)/i);
    if (timeMatch && !timelineMonths) timelineMonths = parseInt(timeMatch[1]);
  }

  // Extract line items (look for price patterns per line)
  for (const line of lines) {
    const priceMatch = line.match(/(₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*$/i);
    if (priceMatch && line.length > 5) {
      const amount = parseFloat(priceMatch[2].replace(/,/g, ''));
      if (amount > 100 && amount < 10000000) {
        const description = line.replace(priceMatch[0], '').trim();
        if (description.length > 3) {
          items.push({ description, amount, unit: 'LS', qty: 1 });
        }
      }
    }
  }

  return {
    builderName,
    totalAmount: totalAmount || items.reduce((s, i) => s + i.amount, 0),
    timelineMonths,
    items,
    rawText,
    parseQuality: items.length > 0 ? 'good' : 'partial',
  };
}

// ── Score a single quotation ──────────────────────────────
function scoreQuotation(quotation, allQuotations) {
  const totals = allQuotations.map(q => q.totalAmount || 0).filter(Boolean);
  const timelines = allQuotations.map(q => q.timelineMonths || 0).filter(Boolean);
  const scopeCounts = allQuotations.map(q => Object.values(q.normalizedScope || {}).filter(s => s.status === 'INCLUDED').length);

  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);
  const minTimeline = Math.min(...timelines);
  const maxTimeline = Math.max(...timelines);
  const maxScope = Math.max(...scopeCounts);

  const myTotal = quotation.totalAmount || 0;
  const myTimeline = quotation.timelineMonths || 0;
  const myScope = Object.values(quotation.normalizedScope || {}).filter(s => s.status === 'INCLUDED').length;

  // Price score (lower = better, scale 0–100)
  const priceScore = maxTotal === minTotal ? 70
    : Math.round(100 - ((myTotal - minTotal) / (maxTotal - minTotal)) * 100);

  // Timeline score (faster = better)
  const timelineScore = maxTimeline === minTimeline ? 70
    : myTimeline === 0 ? 50
    : Math.round(100 - ((myTimeline - minTimeline) / (maxTimeline - minTimeline)) * 100);

  // Scope completeness score (more = better)
  const scopeScore = maxScope === 0 ? 50 : Math.round((myScope / maxScope) * 100);

  // Unknown/exclusion risk (fewer unknowns = better)
  const unknownCount = Object.values(quotation.normalizedScope || {}).filter(s => s.status === 'UNKNOWN').length;
  const exclusionRiskScore = Math.max(0, 100 - unknownCount * 10);

  // Composite score (weighted)
  const compositeScore = Math.round(
    priceScore * 0.30 +
    timelineScore * 0.20 +
    scopeScore * 0.30 +
    exclusionRiskScore * 0.20
  );

  return {
    priceScore: Math.min(100, Math.max(0, priceScore)),
    timelineScore: Math.min(100, Math.max(0, timelineScore)),
    scopeScore: Math.min(100, Math.max(0, scopeScore)),
    exclusionRiskScore: Math.min(100, Math.max(0, exclusionRiskScore)),
    compositeScore: Math.min(100, Math.max(0, compositeScore)),
  };
}

// ── Compare multiple quotations ───────────────────────────
function compareQuotations(quotations) {
  if (!quotations || quotations.length < 2) {
    return { error: 'At least 2 quotations required for comparison.' };
  }

  // Normalize all quotations
  const normalized = quotations.map(q => ({
    ...q,
    normalizedScope: normalizeLineItems(q.items || []),
  }));

  // Score each
  const scored = normalized.map(q => ({
    ...q,
    scores: scoreQuotation(q, normalized),
  }));

  // Sort by composite score
  const ranked = [...scored].sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);
  const bestValue = ranked[0];
  const lowestCost = [...scored].sort((a, b) => a.totalAmount - b.totalAmount)[0];
  const fastest = [...scored].filter(q => q.timelineMonths > 0).sort((a, b) => a.timelineMonths - b.timelineMonths)[0];

  // Build scope comparison table
  const scopeTable = SCOPE_CATEGORIES.map(cat => {
    return {
      category: cat,
      builders: scored.map(q => ({
        builderName: q.builderName,
        status: (q.normalizedScope[cat] || {}).status || 'UNKNOWN',
        subtotal: (q.normalizedScope[cat] || {}).subtotal || 0,
      })),
    };
  });

  // Estimate AI completion dates
  const today = new Date();
  const startDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

  const withDates = scored.map(q => {
    const months = q.timelineMonths || 10;
    const completion = new Date(startDate);
    completion.setMonth(completion.getMonth() + months);
    // AI estimates slightly more conservatively
    const aiCompletion = new Date(startDate);
    aiCompletion.setMonth(aiCompletion.getMonth() + Math.ceil(months * 1.1));
    return {
      ...q,
      estimatedStartDate: startDate.toISOString().split('T')[0],
      builderCompletionDate: completion.toISOString().split('T')[0],
      aiEstimatedCompletionDate: aiCompletion.toISOString().split('T')[0],
      aiVsBuilderDiff: Math.ceil(months * 0.1),
    };
  });

  // Generate recommendation
  let recommendation = `Based on our multi-factor analysis:\n\n`;
  recommendation += `🏆 **Best Value**: ${bestValue.builderName} — composite score ${bestValue.scores.compositeScore}/100. `;
  if (bestValue.builderName !== lowestCost.builderName) {
    recommendation += `While not the cheapest, it offers the best combination of scope coverage, timeline and value.\n`;
  } else {
    recommendation += `This is also the lowest cost option.\n`;
  }
  if (lowestCost && lowestCost.builderName !== bestValue.builderName) {
    recommendation += `💰 **Lowest Cost**: ${lowestCost.builderName} at ₹${lowestCost.totalAmount.toLocaleString('en-IN')} — however check exclusions carefully.\n`;
  }
  if (fastest && fastest.builderName !== bestValue.builderName) {
    recommendation += `⚡ **Fastest**: ${fastest.builderName} at ${fastest.timelineMonths} months.\n`;
  }
  recommendation += `\n⚠️ Note: Lower price quotations may have hidden exclusions. Always verify scope before selecting.`;

  return {
    quotations: withDates,
    scopeTable,
    recommendation,
    bestValue: bestValue.builderName,
    lowestCost: lowestCost?.builderName,
    fastest: fastest?.builderName,
  };
}

module.exports = { parseQuotationText, normalizeLineItems, compareQuotations, scoreQuotation };
