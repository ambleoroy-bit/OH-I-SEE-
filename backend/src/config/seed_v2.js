// ============================================================
// Seed Script V2: Master Demo Data Seeder
// Tagged clearly with [DEMO DATA]
// ============================================================

const supabase = require('./supabase');

async function seedEnterpriseDemoData() {
  try {
    console.log('🌱 Checking Enterprise Demo Data seeding...');

    // 1. Check if projects exist
    const { data: existingProjects } = await supabase.from('projects').select('id').limit(1);
    if (existingProjects && existingProjects.length > 0) {
      console.log('✓ Enterprise database already contains projects/records. Skipping auto-seeding.');
      return;
    }

    console.log('⚡ Populating [DEMO DATA] across Procurement, Subcontract, Logistics, Finance, Quality...');

    // 2. Fetch or create a system user ID
    const { data: users } = await supabase.from('users').select('id').limit(1);
    let userId = users && users[0] ? users[0].id : null;

    if (!userId) {
      console.log('ℹ No existing auth user found for seed linking. Seeding structural defaults.');
      return;
    }

    // 3. Seed Demo Project
    const { data: project } = await supabase
      .from('projects')
      .insert({
        project_id: 'PRJ-DEMO-99',
        user_id: userId,
        project_name: '[DEMO DATA] Coimbatore Industrial Villa',
        project_type: 'Residential',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        budget: 4500000,
        spent_amount: 1250000,
        committed_amount: 2800000,
        quality_tier: 'Standard',
        current_stage: 'Procurement',
        status: 'active'
      })
      .select()
      .single();

    if (!project) return;

    // 4. Seed Purchase Requisition
    const { data: pr } = await supabase
      .from('purchase_requisitions')
      .insert({
        pr_number: 'PR-DEMO-101',
        project_id: project.id,
        requested_by: userId,
        title: '[DEMO DATA] Electrical & Plumbing Phase 1 Requisition',
        category: 'Electrical & Plumbing',
        status: 'APPROVED',
        items: [
          { name: 'CPVC Pipes 1 inch', quantity: 50, unit: 'Lengths', price: 650 },
          { name: 'Schneider 16A Switches', quantity: 100, unit: 'Pieces', price: 180 }
        ]
      })
      .select()
      .single();

    // 5. Seed RFQ
    const { data: rfq } = await supabase
      .from('rfqs')
      .insert({
        rfq_number: 'RFQ-DEMO-201',
        pr_id: pr ? pr.id : null,
        project_id: project.id,
        title: '[DEMO DATA] RFQ for CPVC & Switch Procurement',
        status: 'OPEN',
        items: pr ? pr.items : []
      })
      .select()
      .single();

    // 6. Seed Supplier Quotation
    const { data: quote } = await supabase
      .from('supplier_quotations')
      .insert({
        quote_number: 'SQ-DEMO-301',
        rfq_id: rfq.id,
        supplier_id: userId,
        supplier_name: '[DEMO DATA] Schneider Electric Distributor',
        total_amount: 50500,
        tax_amount: 7700,
        status: 'ACCEPTED',
        items: rfq.items
      })
      .select()
      .single();

    // 7. Seed Purchase Order
    const { data: po } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: 'PO-DEMO-401',
        rfq_id: rfq.id,
        quotation_id: quote.id,
        project_id: project.id,
        supplier_id: userId,
        supplier_name: quote.supplier_name,
        total_amount: quote.total_amount,
        status: 'APPROVED',
        items: quote.items
      })
      .select()
      .single();

    // 8. Seed Shipment & Gate Entry
    const { data: shipment } = await supabase
      .from('shipments')
      .insert({
        shipment_number: 'SHP-DEMO-501',
        po_id: po.id,
        supplier_id: userId,
        vehicle_number: 'TN-37-AZ-9988',
        driver_name: 'Senthil Kumar',
        status: 'ARRIVED'
      })
      .select()
      .single();

    await supabase
      .from('gate_entries')
      .insert({
        gate_entry_number: 'GE-DEMO-601',
        shipment_id: shipment ? shipment.id : null,
        po_number: po.po_number,
        vehicle_number: 'TN-37-AZ-9988',
        supplier_name: quote.supplier_name,
        security_officer: 'Officer V. Raman',
        status: 'ENTERED'
      });

    // 9. Seed GRN
    const { data: grn } = await supabase
      .from('goods_receipts')
      .insert({
        grn_number: 'GRN-DEMO-701',
        po_id: po.id,
        project_id: project.id,
        received_by: 'Site Manager M. Prabhu',
        inspection_status: 'PASSED',
        items: po.items
      })
      .select()
      .single();

    // 10. Seed Invoice & Payment
    const { data: inv } = await supabase
      .from('supplier_invoices')
      .insert({
        invoice_number: 'INV-DEMO-801',
        po_id: po.id,
        grn_id: grn ? grn.id : null,
        project_id: project.id,
        supplier_id: userId,
        subtotal: 42800,
        tax_amount: 7700,
        total_amount: 50500,
        match_status: 'MATCHED',
        payment_status: 'PAID'
      })
      .select()
      .single();

    await supabase
      .from('payments')
      .insert({
        payment_number: 'PAY-DEMO-901',
        invoice_id: inv ? inv.id : null,
        project_id: project.id,
        payer_id: userId,
        payee_id: userId,
        amount: 50500,
        status: 'COMPLETED'
      });

    console.log('✓ Enterprise [DEMO DATA] successfully seeded across Master Business Flow!');

  } catch (err) {
    console.error('Seeding notice:', err.message);
  }
}

module.exports = { seedEnterpriseDemoData };
