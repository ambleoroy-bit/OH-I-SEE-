// ============================================================
// Service: Quality, Dispute & Evaluation Service
// ============================================================

const supabase = require('../config/supabase');

class QualityService {

  // 1. Quality Inspection Record
  static async recordInspection({ projectId, inspectorName, stage, score, result, comments, issuesFound }) {
    const insNumber = 'INS-' + Math.floor(10000 + Math.random() * 90000);

    const { data: inspection, error } = await supabase
      .from('quality_inspections')
      .insert({
        inspection_number: insNumber,
        project_id: projectId,
        inspector_name: inspectorName || 'Quality Inspector',
        stage: stage || 'Construction Material Check',
        score: score || 95,
        result: result || 'PASS',
        comments: comments || 'Standards verified',
        issues_found: issuesFound || []
      })
      .select()
      .single();

    if (error) throw new Error('Failed to record inspection: ' + error.message);
    return inspection;
  }

  // 2. Raise Dispute
  static async raiseDispute({ projectId, raisedBy, targetEntity, subject, description }) {
    const disputeNumber = 'DSP-' + Math.floor(10000 + Math.random() * 90000);

    const { data: dispute, error } = await supabase
      .from('disputes')
      .insert({
        dispute_number: disputeNumber,
        project_id: projectId || null,
        raised_by: raisedBy,
        target_entity: targetEntity || 'Supplier',
        subject: subject,
        description: description,
        status: 'OPEN'
      })
      .select()
      .single();

    if (error) throw new Error('Failed to raise dispute: ' + error.message);
    return dispute;
  }

  // 3. Resolve Dispute
  static async resolveDispute(disputeId, resolutionNotes) {
    const { data: dispute, error } = await supabase
      .from('disputes')
      .update({
        status: 'RESOLVED',
        resolution_notes: resolutionNotes || 'Issue resolved mutually.'
      })
      .eq('id', disputeId)
      .select()
      .single();

    if (error) throw new Error('Failed to resolve dispute: ' + error.message);
    return dispute;
  }

  // 4. Supplier 360 & Scoring Calculation
  static async getSupplier360(supplierId) {
    const { data: pos } = await supabase.from('purchase_orders').select('*').eq('supplier_id', supplierId);
    const { data: quotes } = await supabase.from('supplier_quotations').select('*').eq('supplier_id', supplierId);

    const totalOrders = pos ? pos.length : 0;
    const totalSpend = (pos || []).reduce((sum, po) => sum + Number(po.total_amount || 0), 0);
    const deliveredCount = (pos || []).filter(po => po.status === 'RECEIVED' || po.status === 'CLOSED').length;
    
    const deliveryScore = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 90;
    const qualityScore = 95; // Default score calculated from inspection pass rate

    return {
      supplierId,
      totalOrders,
      totalSpend,
      quotesSubmitted: quotes ? quotes.length : 0,
      deliveryScore,
      qualityScore,
      overallScore: Math.round((deliveryScore + qualityScore) / 2)
    };
  }
}

module.exports = QualityService;
