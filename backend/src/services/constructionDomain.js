'use strict';

const professions = ['Civil Contractor', 'General Contractor', 'Plumber', 'Electrician', 'Civil Engineer', 'Architect', 'Structural Engineer', 'Interior Designer'];
const phases = ['Site preparation', 'Foundation', 'Structure', 'Masonry', 'Plumbing', 'Electrical', 'Waterproofing', 'Plastering', 'Flooring', 'Painting', 'Fixtures', 'Inspection', 'Handover'];
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, name, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${name} is required (maximum ${max} characters).`);
  return value.trim();
}
function number(value, name, min = 0, max = 1000000000) {
  if (value === '' || value === null || typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) fail(`${name} must be between ${min} and ${max}.`);
  return Number(value);
}
function date(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${name} must be a valid date.`);
  return value;
}
function distance(a, b) {
  if ([a?.lat, a?.lng, b?.lat, b?.lng].some(v => v === null || v === undefined || !Number.isFinite(Number(v)))) return null;
  const rad = n => Number(n) * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) * 10) / 10;
}
function rank(profiles, filters) {
  return profiles.filter(p => p.verification === 'verified').map(p => {
    const km = distance(filters, p);
    const reasons = ['Credentials reviewed'];
    let score = 25 + Math.min(p.experience_years, 20) + Number(p.rating || 0) * 5 + Math.min(Number(p.completed_projects || 0), 20);
    if (p.city.toLowerCase() === String(filters.city || '').toLowerCase()) { score += 10; reasons.push('Same project city'); }
    if (p.available) { score += 10; reasons.push('Accepting new work'); }
    if (km !== null) { score += Math.max(0, 10 - km / 5); reasons.push(`${km} km straight-line distance`); }
    return { ...p, distance_km: km, score: Math.round(score), reasons };
  }).filter(p => (!filters.profession || p.profession === filters.profession)
    && (p.distance_km !== null ? p.distance_km <= p.service_radius_km && p.distance_km <= Number(filters.radius || 100) : (filters.lat == null && filters.lng == null && p.city.toLowerCase() === String(filters.city || '').toLowerCase()))
    && Number(p.rating || 0) >= Number(filters.rating || 0)
    && p.experience_years >= Number(filters.experience || 0)
    && Number(p.completed_projects || 0) >= Number(filters.completed || 0)
    && (!filters.available || p.available)
    && (!filters.price || (p.rate !== null && Number(p.rate) <= Number(filters.price))))
    .sort((a, b) => filters.sort === 'rating' ? b.rating - a.rating || b.score - a.score : filters.sort === 'price' ? (a.rate ?? Infinity) - (b.rate ?? Infinity) : filters.sort === 'distance' ? (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) : b.score - a.score);
}
function quotation(input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) fail('Provide 1–50 quotation items.');
  const items = input.items.map(i => ({ description: text(i.description, 'Item description', 300), quantity: number(i.quantity, 'Quantity', 0.01, 100000), rate: number(i.rate, 'Rate', 0, 10000000) }));
  const subtotal = Math.round(items.reduce((s, i) => s + i.quantity * i.rate, 0) * 100) / 100;
  const tax = number(input.tax_percent ?? 0, 'Tax percentage', 0, 30);
  const total = Math.round(subtotal * (1 + tax / 100) * 100) / 100;
  if (total <= 0 || total > 1000000000) fail('Quote total is out of range.');
  const valid_until = date(input.valid_until, 'Valid until');
  if (valid_until < new Date().toISOString().slice(0, 10)) fail('Quotation has expired.');
  return { items, subtotal, tax_percent: tax, total, currency: 'INR', valid_until, start_date: date(input.start_date, 'Start date'), duration_days: number(input.duration_days, 'Duration', 1, 3650), terms: text(input.terms, 'Scope, exclusions, warranty and payment terms', 4000) };
}

// One engagement is an agreement between a customer and one professional.
// Transitions are persisted using a database compare-and-swap, never client state.
function transition(row, action, input, actor, now = new Date().toISOString()) {
  const customer = row.customer_id === actor;
  const professional = row.professional_id === actor;
  if (!customer && !professional) fail('Engagement not found.', 404);
  const data = structuredClone(row.data);
  const need = (condition, message) => { if (!condition) fail(message, 409); };
  const role = allowed => { if (!allowed) fail('This action is not permitted for your account.', 403); };
  switch (action) {
    case 'message':
      need((data.messages || []).length < 500, 'Conversation limit reached.');
      (data.messages ||= []).push({ author: actor, text: text(input.text, 'Message'), at: now });
      break;
    case 'site_visit':
      need(['requested', 'quoted'].includes(data.stage), 'Visits must be arranged before contracting.');
      data.visit = { date: date(input.date, 'Site visit date'), time: text(input.time, 'Preferred time', 50), note: text(input.note, 'Visit scope', 500), proposed_by: actor, confirmed: false };
      need(data.visit.date >= now.slice(0, 10), 'Choose a future visit date.');
      break;
    case 'confirm_visit':
      need(data.visit && data.visit.proposed_by !== actor && !data.visit.confirmed, 'The other participant must propose a visit first.');
      data.visit.confirmed = true;
      break;
    case 'quote':
      role(professional); need(['requested', 'quoted'].includes(data.stage), 'Quotation is already accepted.');
      data.quote = quotation(input); data.stage = 'quoted'; break;
    case 'accept_quote':
      role(customer); need(data.stage === 'quoted', 'A submitted quotation is required.');
      need(data.quote.valid_until >= now.slice(0, 10), 'Quotation expired; request a new quotation.');
      data.stage = 'contract'; data.contract = { quote: structuredClone(data.quote), customer_accepted_at: now, professional_accepted_at: null }; break;
    case 'sign_contract':
      role(professional); need(data.stage === 'contract', 'Customer must accept the quotation first.');
      data.contract.professional_accepted_at = now; data.stage = 'payment'; break;
    case 'start':
      role(professional); need(data.stage === 'ready' && data.payment?.status === 'captured', 'A verified payment is required before work starts.');
      data.stage = 'construction';
      data.tasks = phases.map((name, i) => ({ id: i + 1, name, progress: 0, quality: 'pending', materials: '', cost: 0, assigned_to: row.professional_id })); break;
    case 'task': {
      role(professional); need(data.stage === 'construction', 'Construction is not active.');
      const task = data.tasks.find(t => t.id === Number(input.id)); need(task, 'Task not found.');
      const progress = number(input.progress, 'Progress', 0, 100);
      need(!data.tasks.some(t => t.id < task.id && t.progress < 100) || progress === 0, 'Complete preceding construction stages first.');
      task.progress = progress; task.cost = number(input.cost, 'Actual cost'); task.materials = String(input.materials || '').slice(0, 2000);
      task.quality = 'pending'; task.updated_at = now; break;
    }
    case 'quality': {
      role(customer); need(data.stage === 'construction', 'Construction is not active.');
      const task = data.tasks.find(t => t.id === Number(input.id)); need(task && task.progress === 100, 'Complete this task before accepting its quality.');
      task.quality = 'customer_accepted'; task.accepted_at = now; break;
    }
    case 'variation':
      need(data.stage === 'construction' && !data.variation, 'Only one open variation is allowed during construction.');
      data.variation = { description: text(input.description, 'Change description'), cost: number(input.cost, 'Additional cost'), days: number(input.days, 'Additional days', 0, 365), proposed_by: actor, at: now, approvals: [actor] }; break;
    case 'approve_variation':
      need(data.variation && !data.variation.approvals.includes(actor), 'The other participant must propose or approve the change.');
      (data.approved_variations ||= []).push({ ...data.variation, approvals: [data.variation.proposed_by, actor], approved_at: now });
      data.design_review_required = true;
      data.variation = null; break;
    case 'reject_variation':
      need(data.variation, 'No open variation.'); data.variation = null; break;
    case 'request_completion':
      role(professional); need(data.stage === 'construction' && !data.variation && data.tasks.every(t => t.progress === 100 && t.quality === 'customer_accepted'), 'All tasks must be complete and accepted, with no pending variation.');
      data.stage = 'handover'; break;
    case 'complete':
      role(customer); need(data.stage === 'handover', 'Professional must request handover first.'); data.stage = 'completed'; data.completed_at = now; break;
    case 'review':
      role(customer); need(data.stage === 'completed' && !data.review, 'Only one review is allowed after completed work.');
      data.review = { rating: number(input.rating, 'Rating', 1, 5), text: text(input.text, 'Review'), at: now };
      need(Number.isInteger(data.review.rating), 'Rating must be a whole number.'); break;
    default: fail('Unknown workflow action.');
  }
  return data;
}
module.exports = { professions, phases, fail, text, number, date, distance, rank, quotation, transition };
