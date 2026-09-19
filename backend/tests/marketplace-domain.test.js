 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../src/services/marketplaceDomain'),rooms=require('../../frontend/js/requirements-step-model');
const req={...rooms.defaults(),plot_length:30,plot_width:20,built_up_area:1000,floors:'G + 1 (2 Floors)',qty_bedrooms:2};
test('room larger than plot is rejected, including the reported 798 sq.ft kitchen',()=>{
 const r=rooms.areaValidation({...req,size_kitchen:798});assert.match(r.errors.size_kitchen,/600/);
});
test('room totals count each additional bedroom and reject overflow',()=>{
 const r=rooms.areaValidation({...req,qty_bedrooms:4,size_master_bedroom:250,size_bedroom_2:200,size_living:200});assert.equal(r.roomArea,1050);assert(r.errors.room_area);
});
test('buildable area honors setbacks and multiple floors',()=>{
 const r=rooms.areaValidation({...req,built_up_area:600},{plot_length_ft:30,plot_width_ft:20,setback_front_ft:2,setback_rear_ft:2,setback_left_ft:5,setback_right_ft:5});assert.equal(r.footprint,320);assert.equal(r.capacity,640);assert.deepEqual(r.errors,{});
 assert(rooms.areaValidation({...req,built_up_area:650},{plot_length_ft:30,plot_width_ft:20,setback_front_ft:2,setback_rear_ft:2,setback_left_ft:5,setback_right_ft:5}).errors.built_up_area);
});
test('negative, infinite and malformed room sizes are rejected',()=>{for(const size of [-1,'abc',Infinity])assert(rooms.areaValidation({...req,size_kitchen:size}).errors.size_kitchen);});
test('contractor rates are required, ordered and tied to account role',()=>{
 const input={company:'Real Builder',city:'Coimbatore',scope:'Civil and finish work',rate_min:1500,rate_max:2000};
 assert.equal(m.profile(input,{id:'b',role:'Partner',partner_type:'Contractor'}).kind,'contractor');
 assert.throws(()=>m.profile({...input,rate_max:1000},{id:'b',role:'Partner',partner_type:'Contractor'}));
 assert.throws(()=>m.profile(input,{id:'c',role:'Customer'}));
 assert(!m.eligible({role:'Partner',partner_type:'Contractor',partner_status:'suspended'},'contractor'));
});
test('comparison uses project area, ranks affordable range first and excludes unavailable companies',()=>{
 const profiles=[{user_id:'high',company:'High',city:'Coimbatore',rate_min:2000,rate_max:2500,available:true},{user_id:'low',company:'Low',city:'Coimbatore',rate_min:1000,rate_max:1400,available:true},{user_id:'off',company:'Off',city:'Coimbatore',rate_min:1,rate_max:2,available:false}];
 const rows=m.compare(profiles,{built_up_area:'1,000 sq.ft',city:'Coimbatore',budget:1500000,estimated_cost:1200000});assert.equal(rows.length,2);assert.equal(rows[0].id,'low');assert.equal(rows[0].estimate_max,1400000);assert.equal(rows[0].estimate_difference,-200000);assert.equal(rows[1].budget_gap,500000);
});
const products=[{id:'cement',supplier_id:'s',name:'Cement',brand:'Brand',category:'Cement',unit:'bag',price:400,stock:50,active:true}],suppliers=[{user_id:'s',company:'Registered Supplier',available:true}];
const input={items:[{product_id:'cement',quantity:10,rate:1}],labour:1000,other:100,tax_percent:10,contingency_percent:5,exclusions:'All missing categories excluded for this test',duration_days:30,total:1};
test('proposal ignores client supplied prices and totals and calculates tax/contingency',()=>{const p=m.proposal(input,products,suppliers,{budget:6000});assert.equal(p.materials,4000);assert.equal(p.total,5865);assert.equal(p.variance,-135);assert.equal(p.items[0].company,'Registered Supplier');assert(p.uncovered.includes('Electrical'));});
test('proposal rejects duplicate products, unavailable suppliers and excess stock',()=>{
 assert.throws(()=>m.proposal({...input,items:[...input.items,...input.items]},products,suppliers,{budget:1}));
 assert.throws(()=>m.proposal(input,products,[],{budget:1}));
 assert.throws(()=>m.proposal({...input,items:[{product_id:'cement',quantity:51}]},products,suppliers,{budget:1}));
});

test('non-finite plot dimensions and negative room counts cannot bypass area checks',()=>{
 assert(rooms.areaValidation({...req,plot_length:Infinity}).errors.plot_size);
 assert(rooms.areaValidation({...req,qty_bedrooms:-3}).errors.qty_bedrooms);
 assert(rooms.areaValidation({...req,custom_rooms:{}}).errors.room_area);
});
const roomAuto=require('../../frontend/js/requirements-step-model');
test('auto room sizes respect repeated bedrooms, custom rooms and circulation reserve',()=>{
 const r={plot_length:34,plot_width:70,built_up_area:1800,floors:'G + 1',qty_bedrooms:3,qty_bathrooms:2,qty_living:1,qty_kitchen:1,qty_dining:1,qty_pooja:1,qty_study:1,custom_rooms:[{name:'Store',qty:1,size:40}]};
 const result=roomAuto.autoRoomSizes(r);
 const area=roomAuto.areaValidation({...r,...result.sizes});
 assert.equal(Object.keys(area.errors).length,0);assert.ok(area.remaining>=result.reserved);
 assert.ok(result.sizes.size_master_bedroom>result.sizes.size_bedroom_2);
 assert.equal(r.custom_rooms[0].size,40);
 assert.throws(()=>roomAuto.autoRoomSizes({...r,built_up_area:89}),/too small/);
 assert.throws(()=>roomAuto.autoRoomSizes({...r,built_up_area:9000}),/cannot exceed/);
});
