'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {transition,rank,quotation,distance}=require('../src/services/constructionDomain');
const {verifySignature,capturedPayment}=require('../src/services/constructionPayments');
const quote={items:[{description:'Labour',quantity:2,rate:1000},{description:'Materials',quantity:1,rate:3000}],tax_percent:18,valid_until:'2099-01-01',start_date:'2099-01-02',duration_days:30,terms:'Scope: house construction. Excludes permits. Warranty one year. Full payment after mutual acceptance.'};
const make=()=>({customer_id:'customer',professional_id:'professional',data:{stage:'requested'}});
const change=(r,a,i={},actor='professional')=>{r.data=transition(r,a,i,actor);};
test('quote total is calculated from validated line items, not submitted total',()=>{
 assert.equal(quotation({...quote,total:1}).total,5900);
 assert.throws(()=>quotation({...quote,items:[{description:'Bad',quantity:-1,rate:1}]}));
 assert.throws(()=>quotation({...quote,items:[{description:'Bad',quantity:1,rate:'NaN'}]}));
});
test('unrelated accounts and customer-authored quotes are rejected',()=>{
 assert.throws(()=>transition(make(),'message',{text:'hi'},'stranger'),{status:404});
 assert.throws(()=>transition(make(),'quote',quote,'customer'),{status:403});
});
test('payment and contract gates cannot be skipped',()=>{
 const r=make();assert.throws(()=>change(r,'start'));
 change(r,'quote',quote);assert.throws(()=>change(r,'sign_contract'));
 change(r,'accept_quote',{},'customer');change(r,'sign_contract');
 assert.equal(r.data.stage,'payment');assert.throws(()=>change(r,'start'));
});
test('completed workflow enforces sequential tasks, customer quality and one review',()=>{
 const r=make();change(r,'quote',quote);change(r,'accept_quote',{},'customer');change(r,'sign_contract');
 r.data.payment={order_id:'order_1',amount:590000,currency:'INR',status:'created'};
 const event={event:'payment.captured',payload:{payment:{entity:{id:'pay_1',order_id:'order_1',amount:590000,currency:'INR',captured:true,status:'captured'}}}};
 r.data=capturedPayment(r,event);assert.equal(capturedPayment(r,event),null);change(r,'start');
 assert.throws(()=>change(r,'review',{rating:5,text:'Too early'},'customer'));
 assert.throws(()=>change(r,'task',{id:2,progress:100,cost:0}));
 for(const t of r.data.tasks){change(r,'task',{id:t.id,progress:100,cost:10,materials:'Recorded'});change(r,'quality',{id:t.id},'customer');}
 change(r,'request_completion');change(r,'complete',{},'customer');change(r,'review',{rating:5,text:'Completed as agreed'},'customer');
 assert.equal(r.data.stage,'completed');assert.throws(()=>change(r,'review',{rating:4,text:'Again'},'customer'));
});
test('payment webhook verifies original bytes and rejects mismatched amounts',()=>{
 const raw=Buffer.from('{"event":"payment.captured"}'),secret='test-only-secret';
 const signature=crypto.createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(verifySignature(raw,signature,secret),true);
 assert.equal(verifySignature(Buffer.from(raw+' '),signature,secret),false);
 assert.equal(verifySignature(raw,'invalid',secret),false);
 const r=make();r.data.stage='payment';r.data.payment={order_id:'order',amount:100};
 assert.throws(()=>capturedPayment(r,{event:'payment.captured',payload:{payment:{entity:{id:'pay',order_id:'order',amount:1,currency:'INR',captured:true,status:'captured'}}}}));
});
test('variation requires both participants and does not silently change designs',()=>{
 const r=make();r.data.stage='construction';
 change(r,'variation',{description:'Add bathroom',cost:50000,days:10},'customer');
 assert.throws(()=>change(r,'approve_variation',{},'customer'));
 change(r,'approve_variation');assert.equal(r.data.approved_variations.length,1);assert.equal(r.data.design_review_required,true);
});
test('discovery excludes unverified and out-of-radius profiles; unknown distance stays unknown',()=>{
 const p={id:'p',verification:'verified',city:'Coimbatore',profession:'Plumber',experience_years:10,available:true,service_radius_km:20,rating:4,completed_projects:2,rate:100};
 assert.equal(rank([p],{city:'Coimbatore'})[0].distance_km,null);
 assert.equal(rank([{...p,verification:'pending'}],{city:'Coimbatore'}).length,0);
 assert.equal(rank([{...p,lat:12,lng:77}],{city:'Coimbatore',lat:11,lng:77}).length,0);
 assert.equal(rank([p],{city:'Coimbatore',lat:0,lng:0}).length,0);
 assert.equal(distance({lat:0,lng:0},{lat:0,lng:0}),0);
 assert.equal(rank([p],{city:'Chennai'}).length,0);
});
test('site visit cannot be self-confirmed or scheduled in the past',()=>{
 const r=make();assert.throws(()=>change(r,'site_visit',{date:'2000-01-01',time:'10:00',note:'Inspect'}));
 change(r,'site_visit',{date:'2099-01-01',time:'10:00',note:'Inspect'});
 assert.throws(()=>change(r,'confirm_visit'));change(r,'confirm_visit',{},'customer');assert.equal(r.data.visit.confirmed,true);
});

