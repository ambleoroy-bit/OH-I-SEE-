// ============================================
// OH I SEE — Product Data Store & Catalog Generator
// Generates exactly 263 unique products across 14 categories
// ============================================

const PRODUCTS = [];

// Base data configurations for generating realistic catalog items
const CATEGORIES_TEMPLATE = [
  { name: "Pipes", items: ["PVC Conduit Pipe", "Flexible Corrugated Pipe", "SWR drainage Pipe", "Garden watering Hose", "Heavy-duty PVC Conduit"], sizes: ["1/2\"", "3/4\"", "1\"", "1-1/4\"", "1-1/2\"", "2\"", "2-1/2\"", "3\"", "4\""], brands: ["Supreme", "Astral", "Finolex"] },
  { name: "Pipe Fittings", items: ["Elbow 90-Deg", "Equal Tee", "Straight Coupling", "Union Joint", "MTA connector", "FTA connector", "Tank Nipple Fitting", "Shoe bend", "Dummy End cap"], sizes: ["1/2\"", "3/4\"", "1\"", "1-1/4\"", "1-1/2\"", "2\"", "2-1/2\"", "3\"", "4\""], brands: ["Supreme", "Astral", "Prince"] },
  { name: "Valves", items: ["Compact PVC Ball Valve", "Forged Brass Ball Valve", "Hydraulic Gate Valve", "Spring-loaded Check Valve"], sizes: ["1/2\"", "3/4\"", "1\"", "1-1/2\"", "2\"", "2-1/2\""], brands: ["Zoloto", "Leader", "Kirloskar"] },
  { name: "Reducers", items: ["Reducing Coupling", "CPVC Reducer Socket", "UPVC Reducer Bushing"], sizes: ["3/4\" x 1/2\"", "1\" x 1/2\"", "1\" x 3/4\"", "1-1/2\" x 1\"", "2\" x 1\"", "2-1/2\" x 1-1/2\"", "3\" x 2\"", "4\" x 3\""], brands: ["Supreme", "Astral"] },
  { name: "Bushes", items: ["Threaded Reducer Bushing", "Hex Reducing Bushing", "Solderless PVC Bush", "Heavy Brass reducing Bush"], sizes: ["3/4\" x 1/2\"", "1\" x 1/2\"", "1\" x 3/4\"", "1-1/2\" x 1-1/4\"", "2\" x 1-1/2\""], brands: ["Unbrako", "Precision"] },
  { name: "Brass Fittings", items: ["Brass Equal Tee", "Brass 90-Deg Elbow", "Brass Reducing Adapter", "Brass hex Nipple", "Brass Female Coupling"], sizes: ["1/2\"", "3/4\"", "1\"", "1-1/2\"", "2\""], brands: ["Tata", "Precision"] },
  { name: "Bathroom Fittings", items: ["T Tap Valve", "Long Body Bib Tap", "Short Body Sink Tap", "Angle Stop Cock Tap", "Washing Machine bib Tap", "Concealed Shower Valve", "Flexible PVC Shower hose", "Stainless Steel Shower head"], sizes: ["Standard", "Premium"], brands: ["Jaquar", "Parryware", "Hindware"] },
  { name: "Bathroom Accessories", items: ["Waste Water Cup strainer", "Flexible Waste water Hose", "Waste Connection Pipe"], sizes: ["Standard"], brands: ["Supreme", "Astral"] },
  { name: "CPVC Products", items: ["CPVC SDR-11 Pipe", "CPVC 90 Elbow", "CPVC Equal Tee", "CPVC Straight Coupling", "CPVC Reducer socket", "CPVC End Cap blocker", "CPVC 45 Bend", "CPVC Pipe Saddle Clamp"], sizes: ["1/2\"", "3/4\"", "1\"", "1-1/2\"", "2\""], brands: ["Astral", "Ashirvad"] },
  { name: "UPVC Products", items: ["UPVC SCH-40 Pipe", "UPVC 90 Elbow", "UPVC Equal Tee", "UPVC Coupling joint", "UPVC End Cap plug", "UPVC Reducer Bushing"], sizes: ["1/2\"", "3/4\"", "1\"", "1-1/2\"", "2\""], brands: ["Astral", "Supreme"] },
  { name: "Electrical", items: ["Molded Case Circuit Breaker", "Three-Pole Power Contactor", "Miniature Circuit Breaker C10", "Modular Switch box board", "VFD Motor Control Panel"], sizes: ["Standard"], brands: ["Schneider Electric", "Siemens", "ABB"] },
  { name: "Hardware", items: ["SS Hex head Bolt", "Heavy Duty butt Hinge", "Cylindrical Mortise Lock set", "SS Cabinet D handle", "Self-locking Nylon Nut"], sizes: ["Standard"], brands: ["Dorset", "Yale", "Hafele"] },
  { name: "Industrial Tools", items: ["Impact Drill Machine", "Ventilated Safety Helmet", "ARC Inverter Welding Machine", "Heavy duty Angle Grinder", "Aluminium Folding Ladder"], sizes: ["Standard"], brands: ["Bosch", "3M", "Esab", "Makita"] },
  { name: "Plumbing", items: ["CPVC Solvent Cement", "PTFE Thread Seal Tape", "Rubber Flange Gasket", "PVC Pipe Cutter Tool"], sizes: ["Standard"], brands: ["Astral", "Supreme", "Zoloto"] }
];

let globalId = 1;
let catIndex = 0;

// Deterministic generation loops
while (PRODUCTS.length < 263) {
  const cat = CATEGORIES_TEMPLATE[catIndex % CATEGORIES_TEMPLATE.length];
  const item = cat.items[Math.floor(((globalId + catIndex) * 7) % cat.items.length)];
  const size = cat.sizes[Math.floor(((globalId + catIndex) * 11) % cat.sizes.length)];
  const brand = cat.brands[Math.floor(((globalId + catIndex) * 13) % cat.brands.length)];
  
  const name = `${brand} ${item} - ${size}`;
  const skuPrefix = cat.name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
  const sku = `OHI-${skuPrefix}-${2000 + globalId}`;
  
  // Ensure uniqueness
  if (!PRODUCTS.some(p => p.name === name || p.sku === sku)) {
    // Generate deterministic price based on ID
    const price = Math.floor(((globalId * 17) % 4950) + 50); // price between 50 and 5000
    const originalPrice = (globalId % 3 === 0) ? Math.floor(price * 1.20) : null;
    const stockQty = Math.floor(((globalId * 23) % 250) + 2); // stock quantity between 2 and 252

    let imagePath = "images/cat-electrical.png";
    if (["Plumbing", "Valves", "Pipes", "Pipe Fittings", "Reducers", "Bushes", "Brass Fittings", "CPVC Products", "UPVC Products", "Bathroom Fittings", "Bathroom Accessories"].includes(cat.name)) {
      imagePath = "images/cat-plumbing.png";
    } else if (["Hardware"].includes(cat.name)) {
      imagePath = "images/cat-hardware.png";
    } else if (["Industrial Tools"].includes(cat.name)) {
      imagePath = "images/cat-industrial.png";
    }

    PRODUCTS.push({
      id: globalId,
      name: name,
      brand: brand,
      category: cat.name,
      sku: sku,
      price: price,
      originalPrice: originalPrice,
      image: imagePath,
      stock: stockQty > 10 ? "instock" : stockQty > 0 ? "limited" : "outofstock",
      stockQty: stockQty,
      badge: stockQty > 200 ? "bestseller" : stockQty > 20 ? "instock" : "limited",
      description: `Premium industrial grade ${item} constructed by ${brand} for professional engineering and plumbing installations. Standard sizing of ${size}.`,
      specs: {
        "Size": size,
        "Brand": brand,
        "Category": cat.name,
        "Unit": "Pieces",
        "GST": "18%",
        "MOQ": "1",
        "Material": "Industrial PVC/Metal Alloys"
      }
    });
    globalId++;
  }
  catIndex++;
}

// Categories list metadata for sidebar rendering
const CATEGORIES = CATEGORIES_TEMPLATE.map(c => ({
  name: c.name,
  icon: c.name.includes("Electrical") ? "⚡" : c.name.includes("Tool") ? "🔧" : c.name.includes("Hardware") ? "🔩" : "🏗️",
  count: `${PRODUCTS.filter(p => p.category === c.name).length} SKUs`,
  image: ["Electrical"].includes(c.name) ? "images/cat-electrical.png" : ["Hardware"].includes(c.name) ? "images/cat-hardware.png" : "images/cat-plumbing.png",
  link: `products.html?cat=${c.name}`
}));

const BRANDS = [
  "Supreme", "Astral", "Finolex", "Zoloto", "Leader", "Kirloskar", "Unbrako", "Precision", 
  "Tata", "Jaquar", "Parryware", "Hindware", "Ashirvad", "Schneider Electric", "Siemens", "ABB", "Dorset", "Yale", "Hafele", "Bosch", "3M", "Esab", "Makita"
];

const TESTIMONIALS = [
  {
    text: "OH I SEE has become our primary vendor for all electrical components. Their consistent product quality and competitive pricing have saved us 15% annually.",
    author: "Rajesh Kumar", company: "Rajesh Enterprises", initials: "RK"
  },
  {
    text: "The bulk quotation process is incredible. We get customized pricing for our contract plumbing projects within 24 hours. Highly recommended for contractors.",
    author: "Subramaniam M.", company: "AquaForce Plumbing", initials: "SM"
  },
  {
    text: "Reliable supplier. We've faced zero delivery issues over the last year. The quality while competitive pricing makes them the right choice for industrial projects.",
    author: "Naveen S.", company: "NS Industrial Solutions", initials: "NS"
  }
];

if (typeof module !== 'undefined') {
  module.exports = { PRODUCTS, CATEGORIES, BRANDS, TESTIMONIALS };
}
