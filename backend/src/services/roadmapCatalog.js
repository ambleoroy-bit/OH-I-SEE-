'use strict';
// Planning reference transcribed from Procedure.pdf and Grades.pdf supplied by the client.
const stages=[
 ['design','Design, soil study & approvals','1–3 weeks','None','Latest architectural and structural drawings, soil investigation, local approvals, service layouts, BOQ and schedule'],
 ['survey','Site survey & setting out','1–2 days','None','Plot boundaries, grid lines, setbacks, road level, permanent benchmark and diagonals'],
 ['preparation','Site preparation','2–4 days','None','Temporary power/water, access, storage and site safety'],
 ['excavation','Foundation excavation','3–7 days','None','Length, width, depth, soil condition, groundwater and founding level before PCC'],
 ['pcc','PCC','1–2 days','Typically 3–7 days before major footing activity; protect from drying','Thickness, level and concrete grade from the approved specification'],
 ['footing_steel','Footing reinforcement & formwork','2–4 days','None','Bar diameter, spacing, cover, starters, footing dimensions and clean formwork before pour'],
 ['footing_concrete','Footing concrete','1–2 days','Generally at least 7 days; longer where specified','Concrete grade, vibration, levels and test cubes where required'],
 ['plinth','Foundation / plinth masonry & beam','7–14 days','Concrete generally at least 7 days; masonry typically 7–10 days','Plinth height, beam reinforcement, filling material, layer thickness and compaction'],
 ['columns','Columns','4–7 days per floor','Generally at least 7 days; follow specification','Verticality, reinforcement, cover and shutter removal timing'],
 ['slab','Beams & slab','7–14 days per floor','Generally at least 7 days; props and loading require separate engineering clearance','Reinforcement, cover, anchorage, sleeves, openings, formwork level and support'],
 ['masonry','Masonry / walls','2–3 weeks per floor','Typically at least 7 days; follow material specification','Wall thickness, room dimensions, openings, line, level, plumb, joints and lintels'],
 ['services','Electrical & plumbing rough-in','1–2 weeks','Pressure/leak tests before concealment','Light, socket, appliance, AC/geyser points; pipe sizes, water/drainage routes, traps and sleeves'],
 ['plaster','Internal & external plaster','2–4 weeks','Typically at least 7 days for cement plaster','Thickness, flatness, corners and curing'],
 ['waterproofing','Waterproofing','3–7 days plus testing','Manufacturer curing requirements and specified water/leak test','Toilets, terrace, slopes, upturns, penetrations and test results before tiling'],
 ['flooring','Flooring, tiles & skirting','2–4 weeks','Product-specific adhesive/grout; cure cement underlayers before loading','Layout, levels, slopes, joints, skirting and hollow-sound checks'],
 ['openings','Doors, windows & grills','1–3 weeks','Product-specific sealant/adhesive curing','Measure finished openings; check alignment, operation, hardware, glazing and sealing'],
 ['painting','Painting','2–4 weeks','Product drying/recoat times; substrate must be dry','Approve sample shades, primer, coats and final finish'],
 ['fixtures','Kitchen, sanitary & fixtures','1–2 weeks','Product-specific adhesive/sealant curing before use','Connections, slopes, sanitary fixtures, pumps, tanks and operation'],
 ['testing','Testing, snagging & rectification','1–2 weeks','Repaired cementitious areas require curing','Room-by-room electrical, plumbing, drainage and waterproofing tests; record defects and correction dates'],
 ['handover','Final cleaning & handover','1–3 days','Ensure finishes and sealants have cured','Final measurements, snag correction, test reports, warranties, manuals, keys and as-built information']
].map(([id,title,duration,curing,checks])=>({id,title,duration,curing,checks,per_floor:['columns','slab','masonry'].includes(id),hold:['excavation','footing_steel','footing_concrete','columns','slab','services','waterproofing','testing'].includes(id)}));
const grades=['Economy','Basic','Standard','Premium','Luxury'];
const specifications=[
 ['Concrete',['M20 where design permits','M25 where specified','M25–M30 as designed','M30 where specified','M35+ only for special designs'],true],
 ['Reinforcement',['Fe415','Fe500','Fe500D','Fe550/Fe550D','Project-specific high-strength grade'],true],
 ['PCC',['M7.5 / ~75 mm','M7.5–M10 / 75–100 mm','M10 / 75–100 mm','M15 / ~100 mm','Project-specific'],true],
 ['Slab thickness',['Indicative 100–110 mm','110–120 mm','120–150 mm','150 mm+','Project-specific'],true],
 ['Wall thickness',['100 mm','100–115 mm','150 mm','200 mm','200 mm+ / system-specific'],true],
 ['Internal plaster',['10 mm','10–12 mm','12 mm','12–15 mm','15 mm+ / system-specific'],false],
 ['External plaster',['12 mm','12–15 mm','15–18 mm','18–20 mm','System-specific'],false],
 ['Flooring',['Ceramic/basic vitrified','Good vitrified','Premium vitrified/porcelain','Large-format porcelain','Designer/imported/premium systems'],false],
 ['Paint',['Economy emulsion','Standard emulsion','Premium washable','Premium interior/exterior','High-performance/designer coating'],false],
 ['Waterproofing',['Cementitious','Polymer-modified','Proprietary multi-layer','High-performance membrane/system','Premium system + enhanced detailing'],false]
].map(([item,values,engineer_required])=>({item,values,engineer_required}));
module.exports={stages,grades,specifications,notice:'Planning references from the supplied PDFs, not automatic engineering specifications. Approved drawings, soil investigation, professional review, local approvals and manufacturer instructions govern. Curing may overlap other approved work; never sum all curing periods or infer permission to remove props or load a slab.',standards:['IS 456:2000','IS 1786:2008','IS 1892:2021','IS 875 series','Applicable NBC/local rules and manufacturer requirements (verify current applicability with the project professional)']};
