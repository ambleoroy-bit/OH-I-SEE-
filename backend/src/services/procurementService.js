// ============================================================
// Service: Procurement Service
// Master flow: BOQ / Requirement -> PR -> RFQ -> Quotation -> Comparison -> PO
// ============================================================

const supabase = require('../config/supabase');

class ProcurementService {

  // 1. Purchase Requisition (PR)
  static async createPR({ projectId, requestedBy, title, category, requiredDate, deliveryLocation, justification, items }) {
    // Validate project exists
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projErr || !project) throw new Error('Project not found');

    const prNumber = 'PR-' + Math.floor(10000 + Math.random() * 90000);

    const { data: pr, error: prErr } = await supabase
      .from('purchase_requisitions')
      .insert({
        pr_number: prNumber,
        project_id: projectId,
        requested_by: requestedBy,
        title: title || `Requisition for ${category}`,
        category: category || 'General',
        required_date: requiredDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        delivery_location: deliveryLocation || project.city || 'Site Address',
        justification: justification || 'Project material requirement',
        items: items || [],
        status: 'SUBMITTED'
      })
      .select()
      .single();

    if (prErr) throw new Error('Failed to create Purchase Requisition: ' + prErr.message);

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: requestedBy,
      entity_name: 'purchase_requisitions',
      entity_id: pr.pr_number,
      action: 'CREATE_PR',
      details: { projectId, itemsCount: (items || []).length }
    });

    return pr;
  }

  static async approvePR(prId, approverId) {
    const { data: pr, error: prErr } = await supabase
      .from('purchase_requisitions')
      .select('*')
      .eq('id', prId)
      .single();

    if (prErr || !pr) throw new Error('Purchase Requisition not found');

    const { data: updated, error: updateErr } = await supabase
      .from('purchase_requisitions')
      .update({ status: 'APPROVED', updated_at: new Date() })
      .eq('id', prId)
      .select()
      .single();

    if (updateErr) throw new Error('Failed to approve PR: ' + updateErr.message);

    await supabase.from('audit_logs').insert({
      actor_id: approverId,
      entity_name: 'purchase_requisitions',
      entity_id: pr.pr_number,
      action: 'APPROVE_PR',
      details: { approvedAt: new Date() }
    });

    return updated;
  }

  // 2. Request For Quotation (RFQ)
  static async createRFQ({ prId, projectId, title, responseDeadline, terms, invitedSuppliers }) {
    let prData = null;
    if (prId) {
      const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', prId).single();
      if (pr) prData = pr;
    }

    const rfqNumber = 'RFQ-' + Math.floor(10000 + Math.random() * 90000);
    const projId = projectId || (prData ? prData.project_id : null);
    const rfqItems = prData ? prData.items : [];

    const { data: rfq, error: rfqErr } = await supabase
      .from('rfqs')
      .insert({
        rfq_number: rfqNumber,
        pr_id: prId || null,
        project_id: projId,
        title: title || (prData ? `RFQ for ${prData.title}` : 'RFQ Material Procurement'),
        response_deadline: responseDeadline || new Date(Date.now() + 5 * 86400000).toISOString(),
        terms: terms || 'Standard 30-day payment upon GRN inspection',
        status: 'OPEN',
        items: rfqItems,
        invited_suppliers: invitedSuppliers || []
      })
      .select()
      .single();

    if (rfqErr) throw new Error('Failed to create RFQ: ' + rfqErr.message);

    if (prId) {
      await supabase.from('purchase_requisitions').update({ status: 'RFQ_CREATED' }).eq('id', prId);
    }

    return rfq;
  }

  // 3. Supplier Quotations
  static async submitQuotation({ rfqId, supplierId, supplierName, items, deliveryDays, paymentTerms, warrantyPeriod }) {
    const { data: rfq, error: rfqErr } = await supabase.from('rfqs').select('*').eq('id', rfqId).single();
    if (rfqErr || !rfq) throw new Error('RFQ not found');

    const quoteNumber = 'SQ-' + Math.floor(10000 + Math.random() * 90000);
    
    // Calculate total amount
    let subtotal = 0;
    const processedItems = (items || []).map(item => {
      const lineTotal = Number(item.quantity || 1) * Number(item.unitPrice || item.price || 0);
      subtotal += lineTotal;
      return { ...item, lineTotal };
    });

    const taxAmount = subtotal * 0.18; // 18% GST
    const totalAmount = subtotal + taxAmount;

    const { data: quote, error: quoteErr } = await supabase
      .from('supplier_quotations')
      .insert({
        quote_number: quoteNumber,
        rfq_id: rfqId,
        supplier_id: supplierId,
        supplier_name: supplierName || 'Registered Vendor',
        total_amount: totalAmount,
        tax_amount: taxAmount,
        delivery_days: deliveryDays || 7,
        payment_terms: paymentTerms || 'Net 30',
        warranty_period: warrantyPeriod || '1 Year',
        items: processedItems,
        status: 'SUBMITTED'
      })
      .select()
      .single();

    if (quoteErr) throw new Error('Failed to submit quotation: ' + quoteErr.message);

    // Update RFQ status
    await supabase.from('rfqs').update({ status: 'RESPONDED' }).eq('id', rfqId);

    return quote;
  }

  // 4. Quotation Comparison
  static async compareQuotations(rfqId) {
    const { data: rfq } = await supabase.from('rfqs').select('*').eq('id', rfqId).single();
    if (!rfq) throw new Error('RFQ not found');

    const { data: quotes } = await supabase
      .from('supplier_quotations')
      .select('*')
      .eq('rfq_id', rfqId);

    const sortedByPrice = [...(quotes || [])].sort((a, b) => a.total_amount - b.total_amount);
    const sortedByDelivery = [...(quotes || [])].sort((a, b) => (a.delivery_days || 99) - (b.delivery_days || 99));

    return {
      rfq,
      quotations: quotes || [],
      cheapest: sortedByPrice[0] || null,
      fastest: sortedByDelivery[0] || null,
      recommendation: sortedByPrice[0] ? `Supplier '${sortedByPrice[0].supplier_name}' offers lowest price ₹${Number(sortedByPrice[0].total_amount).toLocaleString('en-IN')}` : 'No quotations received yet'
    };
  }

  // 5. Purchase Order (PO)
  static async createPOFromQuotation(quotationId, createdBy) {
    const { data: quote, error: qErr } = await supabase
      .from('supplier_quotations')
      .select('*')
      .eq('id', quotationId)
      .single();

    if (qErr || !quote) throw new Error('Quotation not found');

    const { data: rfq } = await supabase.from('rfqs').select('*').eq('id', quote.rfq_id).single();
    const poNumber = 'PO-' + Math.floor(10000 + Math.random() * 90000);

    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: poNumber,
        rfq_id: quote.rfq_id,
        quotation_id: quotationId,
        project_id: rfq ? rfq.project_id : null,
        supplier_id: quote.supplier_id,
        supplier_name: quote.supplier_name,
        subtotal: quote.total_amount - (quote.tax_amount || 0),
        tax_amount: quote.tax_amount || 0,
        total_amount: quote.total_amount,
        expected_delivery_date: new Date(Date.now() + (quote.delivery_days || 7) * 86400000).toISOString().split('T')[0],
        payment_terms: quote.payment_terms || 'Net 30',
        items: quote.items || [],
        status: 'APPROVED'
      })
      .select()
      .single();

    if (poErr) throw new Error('Failed to generate Purchase Order: ' + poErr.message);

    // Update Quotation & RFQ status
    await supabase.from('supplier_quotations').update({ status: 'ACCEPTED' }).eq('id', quotationId);
    await supabase.from('rfqs').update({ status: 'CLOSED' }).eq('id', quote.rfq_id);

    // Update Project Committed Cost
    if (rfq && rfq.project_id) {
      const { data: proj } = await supabase.from('projects').select('committed_amount').eq('id', rfq.project_id).single();
      const newCommitted = Number(proj?.committed_amount || 0) + Number(quote.total_amount);
      await supabase.from('projects').update({
        committed_amount: newCommitted,
        current_stage: 'Procurement',
        progress_procurement: 50
      }).eq('id', rfq.project_id);
    }

    return po;
  }
}

module.exports = ProcurementService;
