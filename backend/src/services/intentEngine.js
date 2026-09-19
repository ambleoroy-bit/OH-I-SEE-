'use strict';
// ============================================================
// OH I SEE — Intent Engine v2
// Extends the original keyword-based engine with:
// 1. Construction intent detection (NEW_HOME, RENOVATION, ELECTRICAL, etc.)
// 2. Progressive question engine for each intent
// 3. Project data summarisation
// ============================================================
const supabase = require('../config/supabase');

// ── Category keyword map (matches real Supabase categories) ─
const CATEGORY_KEYWORDS = {
  'Electrical':         ['electrical','electric','wire','wiring','cable','switch','socket','mcb','fuse','plug','outlet','panel','circuit','conduit','relay','contactor','transformer','voltage','breaker','lighting','bulb','tube','lamp','fan','led','light'],
  'Plumbing':           ['plumbing','plumb','water supply','drain','sewage','pipe','tap','faucet','bathroom fitting'],
  'Industrial Tools':   ['tool','drill','grinder','saw','hammer','screwdriver','wrench','spanner','plier','cutter','chisel','level','power tool','hand tool','cordless','impact','machine','industrial tool'],
  'Hardware':           ['hardware','bolt','nut','screw','nail','fastener','anchor','rivet','washer','hinge','lock','latch','handle','bracket','clamp','hook'],
  'Pipes':              ['pipe','pvc','cpvc','upvc','water pipe','drainage pipe','swr'],
  'Pipe Fittings':      ['fitting','union','tee','elbow','coupling','nipple','pipe fitting'],
  'Valves':             ['valve','gate valve','ball valve','check valve','stop valve'],
  'Bathroom Fittings':  ['shower','bath fitting','bathroom fitting','flush','cistern','toilet','washroom','wc','basin','sanitary'],
  'Bathroom Accessories':['bathroom accessory','towel','soap holder','mirror','cabinet'],
};

// ── Construction Intent Keywords ──────────────────────────
const CONSTRUCTION_INTENTS = {
  NEW_HOME: [
    'build a house','build a home','build my house','new house','new home','construct a house',
    'new construction','build a 3bhk','build a 2bhk','build residential','new residential',
    'construct home','build from scratch','ground up'
  ],
  RENOVATION: [
    'renovate','renovation','repaint','alter','alteration','repair my','upgrade my home',
    'remodel','refurbish','redo my','paint my house','paint my room','false ceiling',
    'bathroom renovation','kitchen renovation','flooring','tiles work','wall work'
  ],
  ELECTRICAL: [
    'electrical work','plan electrical','wiring for','wire my house','electrical layout',
    'electrical plan','lights for my house','lighting plan','led lights','fan points',
    'mcb','db box','electrical estimate','smart home','home automation',
    'i need lights','electrical points','switch layout','power points'
  ],
  PRODUCT_SEARCH: [
    'find products','need cement','need steel','need tiles','need paint','need switches',
    'buy material','purchase','find supplier','compare brands','product recommendation',
    'where to buy','cost of','price of'
  ],
  QUOTE_COMPARE: [
    'compare quotation','compare builder','compare quotes','i have quotes','i have quotations',
    'which builder','best builder','builder comparison','evaluate quotes'
  ],
  BLUEPRINT: [
    'create blueprint','generate floor plan','floor plan','house plan','design my house',
    'layout plan','room plan','architectural plan','ai blueprint','design blueprint'
  ],
  VISUALIZER_3D: [
    '3d model','convert to 3d','visualize','3d view','3d visualization','see in 3d',
    'upload floor plan','convert my plan','interactive 3d','walkthrough'
  ],
};

// ── Progressive Question Banks ────────────────────────────
const QUESTION_BANKS = {
  NEW_HOME: [
    { key: 'location',    question: 'Which city or area will the house be built in?',                           type: 'text',   placeholder: 'e.g. Coimbatore, Tamil Nadu' },
    { key: 'plot_length', question: 'What is the length of your plot? (in feet)',                               type: 'number', placeholder: 'e.g. 40' },
    { key: 'plot_width',  question: 'What is the width of your plot? (in feet)',                                type: 'number', placeholder: 'e.g. 60' },
    { key: 'road_facing', question: 'Which side does the plot face the road?',                                  type: 'select', options: ['East','West','North','South','Corner Plot'] },
    { key: 'floors',      question: 'How many floors do you want to build?',                                    type: 'select', options: ['Ground Floor Only','G + 1 Floor','G + 2 Floors','G + 3 Floors'] },
    { key: 'bedrooms',    question: 'How many bedrooms do you need?',                                           type: 'select', options: ['1 Bedroom','2 Bedrooms','3 Bedrooms','4 Bedrooms','5+ Bedrooms'] },
    { key: 'bathrooms',   question: 'How many bathrooms / toilets?',                                            type: 'select', options: ['1','2','3','4','5+'] },
    { key: 'parking',     question: 'Do you need covered car parking?',                                         type: 'select', options: ['No Parking','1 Car','2 Cars','3+ Cars'] },
    { key: 'has_pooja',   question: 'Do you need a Pooja room?',                                               type: 'select', options: ['Yes','No'] },
    { key: 'has_office',  question: 'Do you need a home office or study room?',                                 type: 'select', options: ['Yes','No'] },
    { key: 'has_terrace', question: 'Do you want a terrace / rooftop space?',                                  type: 'select', options: ['Yes','No'] },
    { key: 'vastu',       question: 'Do you have a Vastu preference for the layout?',                          type: 'select', options: ['Yes — follow Vastu','No — just practical layout','Partly follow Vastu'] },
    { key: 'arch_style',  question: 'What architectural style do you prefer?',                                  type: 'select', options: ['Contemporary / Modern','Traditional','South Indian Traditional','Minimalist','Colonial','No Preference'] },
    { key: 'quality',     question: 'What quality level are you looking for?',                                  type: 'select', options: ['Economic — Budget-conscious','Standard — Balanced quality','Premium — Higher-end finishes'] },
    { key: 'budget',      question: 'What is your approximate total budget for construction? (₹)',              type: 'number', placeholder: 'e.g. 4500000' },
    { key: 'start_date',  question: 'When are you planning to start construction?',                             type: 'select', options: ['Within 1 month','1–3 months','3–6 months','6–12 months','Just planning'] },
    { key: 'extras',      question: 'Any special requirements? (swimming pool, solar, EV charging, lift, etc.)', type: 'text',  placeholder: 'Optional — leave blank if none', optional: true },
  ],
  RENOVATION: [
    { key: 'reno_type',   question: 'What type of renovation are you planning?',                                type: 'multiselect', options: ['Painting','Flooring','Wall Alteration','Room Extension','False Ceiling','Electrical','Plumbing','Bathroom Renovation','Kitchen Renovation','Doors & Windows','Interior Work','Complete Renovation'] },
    { key: 'location',    question: 'Where is the property located?',                                           type: 'text',   placeholder: 'e.g. Coimbatore, Tamil Nadu' },
    { key: 'property_type', question: 'What type of property is it?',                                          type: 'select', options: ['Apartment','Independent House','Villa','Commercial Space','Office'] },
    { key: 'area_sqft',   question: 'What is the approximate area to be renovated? (sq.ft)',                   type: 'number', placeholder: 'e.g. 1200' },
    { key: 'condition',   question: 'What is the current condition of the space?',                              type: 'select', options: ['Good — minor updates needed','Average — needs moderate work','Poor — needs complete overhaul'] },
    { key: 'budget',      question: 'What is your approximate budget for this renovation? (₹)',                type: 'number', placeholder: 'e.g. 500000' },
    { key: 'timeline',    question: 'When do you need the renovation completed by?',                            type: 'select', options: ['Within 2 weeks','Within 1 month','1–3 months','3–6 months','Flexible'] },
  ],
  ELECTRICAL: [
    { key: 'location',      question: 'Which city is the property in?',                                         type: 'text',   placeholder: 'e.g. Chennai, Tamil Nadu' },
    { key: 'property_type', question: 'What type of property?',                                                type: 'select', options: ['New House (under construction)','Existing House (rewiring)','Apartment','Commercial Space','Office'] },
    { key: 'floors',        question: 'How many floors?',                                                       type: 'select', options: ['Ground Floor Only','G + 1','G + 2','G + 3+'] },
    { key: 'rooms',         question: 'How many rooms in total? (bedrooms + living + dining + kitchen)',        type: 'select', options: ['1–3 rooms','4–6 rooms','7–10 rooms','10+ rooms'] },
    { key: 'lighting_style', question: 'What type of lighting do you prefer?',                                 type: 'multiselect', options: ['LED Downlights','Ceiling Fans + Lights','Designer / Decorative Lights','Smart Lighting','Basic Lighting'] },
    { key: 'ac_points',     question: 'How many AC points do you need?',                                       type: 'select', options: ['None','1–2','3–5','6–10','10+'] },
    { key: 'special_needs', question: 'Do you have any special electrical requirements?',                      type: 'multiselect', options: ['Solar / Inverter','EV Charging Point','Home Automation','CCTV','Doorbell / Video Door Phone','Generator Backup','None'] },
    { key: 'budget',        question: 'What is your electrical work budget? (₹)',                              type: 'number', placeholder: 'e.g. 250000', optional: true },
  ],
};

// ── Scope normalization for quotation comparison ──────────
const SCOPE_CATEGORIES = [
  'Foundation & Excavation',
  'RCC Structure',
  'Brickwork / Blockwork',
  'Plastering',
  'Flooring',
  'Painting (Interior)',
  'Painting (Exterior)',
  'Electrical Work',
  'Plumbing Work',
  'Doors & Windows',
  'Kitchen Work',
  'Bathroom Work',
  'Staircase',
  'Terrace / Waterproofing',
  'External Works / Compound Wall',
  'Other / Miscellaneous',
];

// ── Detect construction intent from message ───────────────
function detectConstructionIntent(message) {
  const msg = message.toLowerCase().trim();

  for (const [intent, keywords] of Object.entries(CONSTRUCTION_INTENTS)) {
    if (keywords.some(kw => msg.includes(kw))) {
      return intent;
    }
  }
  return null;
}

// ── Get questions for an intent ───────────────────────────
function getQuestionsForIntent(intentType) {
  return QUESTION_BANKS[intentType] || [];
}

// ── Get next unanswered question ─────────────────────────
function getNextQuestion(intentType, answers = {}) {
  const questions = getQuestionsForIntent(intentType);
  for (const q of questions) {
    if (q.optional) continue;
    if (answers[q.key] === undefined || answers[q.key] === null || answers[q.key] === '') {
      return q;
    }
  }
  // All required answered — check optional
  for (const q of questions) {
    if (!q.optional) continue;
    if (answers[q.key] === undefined) return q;
  }
  return null; // All done
}

// ── Build project payload from session answers ────────────
function buildProjectPayload(intentType, answers, projectName) {
  const floorsMap = {
    'Ground Floor Only': 1,
    'G + 1 Floor': 2,
    'G + 2 Floors': 3,
    'G + 3 Floors': 4,
  };
  const bedroomsMap = {
    '1 Bedroom': 1, '2 Bedrooms': 2, '3 Bedrooms': 3, '4 Bedrooms': 4, '5+ Bedrooms': 5,
  };
  const parkingMap = {
    'No Parking': 0, '1 Car': 1, '2 Cars': 2, '3+ Cars': 3,
  };
  const qualityMap = {
    'Economic — Budget-conscious': 'Economic',
    'Standard — Balanced quality': 'Standard',
    'Premium — Higher-end finishes': 'Premium',
  };

  const base = {
    project_name: projectName || (answers.location ? `${answers.location} Project` : 'My Construction Project'),
    city: answers.location || '',
    intent_type: intentType,
    current_stage: 'Requirement',
    status: 'active',
    budget: parseFloat(answers.budget) || 0,
    quality_level: qualityMap[answers.quality] || 'Standard',
  };

  if (intentType === 'NEW_HOME') {
    const floorsStr = answers.floors || 'Ground Floor Only';
    const floors = floorsMap[floorsStr] || 1;
    const bedrooms = bedroomsMap[answers.bedrooms] || 0;
    const parking = parkingMap[answers.parking] || 0;
    return {
      ...base,
      project_type: 'Residential',
      plot_length: parseFloat(answers.plot_length) || null,
      plot_width: parseFloat(answers.plot_width) || null,
      road_facing: answers.road_facing || 'East',
      floors,
      bedrooms,
      bathrooms: parseInt(answers.bathrooms) || 0,
      parking_count: parking,
      has_pooja: answers.has_pooja === 'Yes',
      has_office: answers.has_office === 'Yes',
      has_terrace: answers.has_terrace === 'Yes',
      vastu_preference: answers.vastu === 'Yes — follow Vastu',
      architectural_style: answers.arch_style || null,
      description: answers.extras || '',
    };
  }

  if (intentType === 'RENOVATION') {
    return {
      ...base,
      project_type: 'Renovation',
      renovation_type: Array.isArray(answers.reno_type) ? answers.reno_type.join(', ') : (answers.reno_type || ''),
      description: `Property: ${answers.property_type || ''}, Area: ${answers.area_sqft || ''} sq.ft, Condition: ${answers.condition || ''}`,
    };
  }

  if (intentType === 'ELECTRICAL') {
    return {
      ...base,
      project_type: 'Electrical',
      electrical_points: {
        lighting_style: answers.lighting_style,
        ac_points: answers.ac_points,
        special_needs: answers.special_needs,
        rooms: answers.rooms,
        floors: answers.floors,
      },
      description: `Electrical: ${answers.property_type || ''}, Rooms: ${answers.rooms || ''}, Special: ${Array.isArray(answers.special_needs) ? answers.special_needs.join(', ') : (answers.special_needs || 'None')}`,
    };
  }

  return base;
}

// ── Original IntentEngine: category/project keyword map ───
const PROJECT_KEYWORDS = {
  'Bathroom Renovation': ['bathroom','toilet','washroom','lavatory','bath'],
  'Kitchen Renovation':  ['kitchen','cooking','sink','tap','kitchen renovation'],
  'Home Wiring':         ['new house','house wiring','wiring project','home electrical','rewiring'],
  'Office Setup':        ['office','workplace','commercial space','office setup'],
  'Plumbing Project':    ['plumbing project','water supply','drainage project','pipe installation'],
  'Electrical Project':  ['electrical project','electrical work','electrical installation'],
  'Construction':        ['construction','building','site','civil','build my house'],
};

function detectIntent(message) {
  const msg = message.toLowerCase().trim();

  // Check construction intents first
  const constructionIntent = detectConstructionIntent(msg);
  if (constructionIntent) {
    return { type: 'construction_intent', intent: constructionIntent };
  }

  if (/list\s+all|show\s+all|all\s+products|display\s+all|get\s+all/.test(msg)) {
    return { type: 'list_all', limit: 12 };
  }

  const priceMatch = msg.match(/(?:under|below|less\s+than|within|up\s+to|upto)\s+[₹rs\s]*(\d[\d,]*)/i)
    || msg.match(/(?:between)\s+[₹rs\s]*(\d[\d,]*)\s+(?:and|to)\s+[₹rs\s]*(\d[\d,]*)/i);

  let minPrice, maxPrice;
  if (priceMatch) {
    if (priceMatch[2]) {
      minPrice = parseInt(priceMatch[1].replace(/,/g,''),10);
      maxPrice = parseInt(priceMatch[2].replace(/,/g,''),10);
    } else {
      maxPrice = parseInt(priceMatch[1].replace(/,/g,''),10);
    }
  }

  let detectedCategory = null;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => msg.includes(kw))) { detectedCategory = cat; break; }
  }

  let detectedProject = null;
  for (const [project, keywords] of Object.entries(PROJECT_KEYWORDS)) {
    if (keywords.some(kw => msg.includes(kw))) { detectedProject = project; break; }
  }

  if (/compar|vs\.?|versus/.test(msg)) return { type: 'compare_prompt' };
  if (/\b(boq|bill of quantities|estimate|cost estimate|project cost|how much|total cost|material list|material estimate)\b/.test(msg)) return { type: 'boq_prompt' };
  if (detectedProject) return { type: 'project', projectType: detectedProject };

  if (detectedCategory || maxPrice || minPrice || msg.length > 3) {
    const query = detectedCategory ? null : extractKeyQuery(msg);
    return { type: 'search', category: detectedCategory, query, minPrice, maxPrice, limit: 8 };
  }

  return { type: 'greeting' };
}

function extractKeyQuery(msg) {
  const stopWords = ['show','me','find','get','list','all','the','some','any','products','product',
    'need','want','looking','for','i','a','an','under','below','above','price','rs',
    'rupees','inr','₹','please','can','you','tell','available','have','items','do','with','what'];
  const words = msg.toLowerCase().split(/\s+/).filter(w => !stopWords.includes(w) && w.length > 2);
  return words.length > 0 ? words[0] : null;
}

async function fetchProducts({ category, query, minPrice, maxPrice, limit = 8 }) {
  let dbQuery = supabase
    .from('products')
    .select('id, product_name, brand, category, price, stock_quantity, image_url, description, specs')
    .eq('is_active', true);

  if (category) dbQuery = dbQuery.eq('category', category);
  if (query) dbQuery = dbQuery.ilike('product_name', `%${query}%`);
  if (minPrice !== undefined) dbQuery = dbQuery.gte('price', minPrice);
  if (maxPrice !== undefined) dbQuery = dbQuery.lte('price', maxPrice);

  const { data: exactData, error } = await dbQuery.order('price', { ascending: true }).limit(limit);
  if (error) throw error;
  if (exactData && exactData.length > 0) return exactData;

  if (category) {
    let fallbackQuery = supabase
      .from('products')
      .select('id, product_name, brand, category, price, stock_quantity, image_url, description, specs')
      .eq('is_active', true)
      .ilike('category', `%${category}%`);
    if (query) fallbackQuery = fallbackQuery.ilike('product_name', `%${query}%`);
    if (minPrice !== undefined) fallbackQuery = fallbackQuery.gte('price', minPrice);
    if (maxPrice !== undefined) fallbackQuery = fallbackQuery.lte('price', maxPrice);
    const { data: fallbackData } = await fallbackQuery.order('price', { ascending: true }).limit(limit);
    return fallbackData || [];
  }

  return exactData || [];
}

function formatProducts(data) {
  return data.map(p => ({
    id: p.id,
    name: p.product_name,
    brand: p.brand || null,
    category: p.category,
    price: p.price,
    stock: p.stock_quantity > 0 ? `${p.stock_quantity} in stock` : 'Out of Stock',
    image: p.image_url || null,
    specs: p.specs || null,
  }));
}

async function handleWithIntent(message) {
  const intent = detectIntent(message);
  console.log('[IntentEngine]', JSON.stringify(intent));

  switch (intent.type) {
    case 'construction_intent': {
      const questions = getQuestionsForIntent(intent.intent);
      const first = questions[0];
      const intentLabels = {
        NEW_HOME: 'New Home Builder',
        RENOVATION: 'Home Renovation',
        ELECTRICAL: 'Electrical & Lighting',
        QUOTE_COMPARE: 'Builder Quote Comparator',
        BLUEPRINT: 'AI Blueprint Builder',
        VISUALIZER_3D: '2D → 3D Visualizer',
      };
      return {
        type: 'construction_intent',
        intent: intent.intent,
        intentLabel: intentLabels[intent.intent] || intent.intent,
        text: `I'll help you with ${intentLabels[intent.intent] || 'your project'}. Let me ask you a few questions to get started.`,
        firstQuestion: first,
        totalQuestions: questions.filter(q => !q.optional).length,
        redirectUrl: `/pages/intent-engine.html?intent=${intent.intent}`,
        chips: [`Open ${intentLabels[intent.intent] || 'Engine'} →`],
      };
    }

    case 'list_all': {
      const data = await fetchProducts({ limit: intent.limit });
      const products = formatProducts(data);
      return { type: 'products', text: `Here are ${products.length} products from our catalog.`, data: products, hasMore: true };
    }

    case 'search': {
      const data = await fetchProducts(intent);
      if (data.length === 0) {
        const fallback = await fetchProducts({ limit: 6 });
        return { type: 'products', text: `Couldn't find exact matches, but here are some popular products:`, data: formatProducts(fallback) };
      }
      const cat = intent.category ? ` in ${intent.category}` : '';
      const budget = intent.maxPrice ? ` under ₹${intent.maxPrice.toLocaleString('en-IN')}` : '';
      return { type: 'products', text: `Found ${data.length} products${cat}${budget}:`, data: formatProducts(data) };
    }

    case 'project': {
      const projectCategoryMap = {
        'Bathroom Renovation': ['Plumbing','Electrical','Hardware'],
        'Kitchen Renovation':  ['Plumbing','Electrical','Hardware'],
        'Home Wiring':         ['Electrical'],
        'Office Setup':        ['Electrical','Hardware'],
        'Construction':        ['Hardware','Electrical','Plumbing'],
      };
      const categories = projectCategoryMap[intent.projectType] || ['Hardware'];
      let allItems = []; let estimatedTotal = 0;
      for (const cat of categories) {
        const data = await fetchProducts({ category: cat, limit: 2 });
        const items = formatProducts(data).map(p => ({ ...p, quantity: 1 }));
        allItems = [...allItems, ...items];
        estimatedTotal += items.reduce((sum, i) => sum + i.price, 0);
      }
      return { type: 'project', text: `Here's a suggested list for your **${intent.projectType}**:`, data: { projectType: intent.projectType, items: allItems, estimatedTotal } };
    }

    case 'compare_prompt':
      return { type: 'text', text: `To compare builder quotations, upload your PDFs or use the **Quote Comparator** engine.`, chips: ['Open Quote Comparator →'] };

    case 'boq_prompt':
      return { type: 'text', text: `To generate a BOQ, describe your project or use the **New Home Builder** engine for a full AI-guided BOQ.`, chips: ['Build New Home →','Renovate My Home →'] };

    case 'greeting':
    default:
      return {
        type: 'text',
        text: `Hi! I'm the OH I SEE AI Assistant. Tell me what you want to build, renovate or buy:\n\n• 🏠 **Build a new house** — "I want to build a 3BHK house"\n• 🔨 **Renovate** — "I want to repaint my house"\n• ⚡ **Electrical** — "I need an electrical plan"\n• 📦 **Find products** — "I need cement and steel"\n• ⚖️ **Compare quotes** — "I have 3 builder quotations"`,
        chips: ['I want to build a 3BHK house','Renovate my kitchen','Plan electrical for new house','Find cement near me'],
      };
  }
}

module.exports = {
  handleWithIntent,
  detectIntent,
  detectConstructionIntent,
  getQuestionsForIntent,
  getNextQuestion,
  buildProjectPayload,
  SCOPE_CATEGORIES,
};
