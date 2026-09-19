// ============================================================
// Service: Finance & AP Service
// Flow: PO + GRN + Supplier Invoice -> 3-Way Match Validation -> Payment -> Project Actual Cost Update
// ============================================================

const supabase = require('../config/supabase');

class FinanceService {

  // 1. Submit Supplier Invoice
  static async submitInvoice({ invoiceNumber, poId, grnId, supplierId, items, subtotal, taxAmount, totalAmount, dueDate }) {
    const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', poId).single();
    if (!po) throw new Error('Purchase Order not found');

    const invNum = invoiceNumber || ('INV-' + Math.floor(10000 + Math.random() * 90000));
    const invSubtotal = Number(subtotal || po.subtotal || 0);
    const invTax = Number(taxAmount || po.tax_amount || 0);
    const invTotal = Number(totalAmount || po.total_amount || 0);

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .insert({
        invoice_number: invNum,
        po_id: poId,
        grn_id: grnId || null,
        project_id: po.project_id,
        supplier_id: supplierId || po.supplier_id,
        subtotal: invSubtotal,
        tax_amount: invTax,
        total_amount: invTotal,
        due_date: dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        match_status: 'RECEIVING',
        payment_status: 'UNPAID',
        items: items || po.items || []
      })
      .select()
      .single();

    if (error) throw new Error('Failed to record invoice: ' + error.message);

    // Perform 3-Way Match automatically
    const matchResult = await this.performThreeWayMatch(invoice.id);

    return { invoice, matchResult };
  }

  // 2. Perform 3-Way Match (PO vs GRN vs Invoice)
  static async performThreeWayMatch(invoiceId) {
    const { data: inv } = await supabase.from('supplier_invoices').select('*').eq('id', invoiceId).single();
    if (!inv) throw new Error('Invoice not found');

    const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', inv.po_id).single();
    if (!po) throw new Error('Associated PO not found');

    // Check if PO total vs Invoice total is within 2% threshold
    const diff = Math.abs(Number(inv.total_amount) - Number(po.total_amount));
    const isMatched = diff < (Number(po.total_amount) * 0.02);

    const matchStatus = isMatched ? 'MATCHED' : 'EXCEPTION';

    await supabase
      .from('supplier_invoices')
      .update({ match_status: matchStatus })
      .eq('id', invoiceId);

    return {
      matched: isMatched,
      matchStatus,
      poAmount: po.total_amount,
      invoiceAmount: inv.total_amount,
      difference: diff
    };
  }

  // 3. Process Payment & Update Project Financial Actuals
  static async processPayment({ invoiceId, payerId, amount, paymentMethod, transactionRef }) {
    const { data: inv } = await supabase.from('supplier_invoices').select('*').eq('id', invoiceId).single();
    if (!inv) throw new Error('Invoice not found');

    if (inv.match_status !== 'MATCHED') {
      throw new Error(`Cannot process payment for invoice with status '${inv.match_status}'. Must pass 3-Way Matching first.`);
    }

    const payNumber = 'PAY-' + Math.floor(10000 + Math.random() * 90000);
    const payAmount = Number(amount || inv.total_amount);

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        payment_number: payNumber,
        invoice_id: invoiceId,
        project_id: inv.project_id,
        payer_id: payerId,
        payee_id: inv.supplier_id,
        amount: payAmount,
        payment_method: paymentMethod || 'BANK_TRANSFER',
        transaction_ref: transactionRef || ('TXN-' + Math.floor(100000 + Math.random() * 900000)),
        status: 'COMPLETED'
      })
      .select()
      .single();

    if (error) throw new Error('Failed to record payment: ' + error.message);

    // Mark invoice as PAID
    await supabase.from('supplier_invoices').update({ payment_status: 'PAID' }).eq('id', invoiceId);

    // Update Project Actual Cost & Stage Progress
    if (inv.project_id) {
      const { data: proj } = await supabase.from('projects').select('spent_amount').eq('id', inv.project_id).single();
      const newSpent = Number(proj?.spent_amount || 0) + payAmount;
      
      await supabase.from('projects').update({
        spent_amount: newSpent,
        progress_procurement: 100,
        updated_at: new Date()
      }).eq('id', inv.project_id);
    }

    return payment;
  }
}

module.exports = FinanceService;
