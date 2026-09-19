// ============================================================
// Routes: Subcontract API Suite
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

// --- Subcontracts ---
router.get('/subcontracts', authenticate, async (req, res) => {
  try {
    const { data: subs, error } = await supabase
      .from('subcontracts')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: subs.length, data: subs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/subcontracts', authenticate, async (req, res) => {
  try {
    const { projectId, subcontractorId, subcontractorName, scopeOfWork, totalContractValue, startDate, completionDate } = req.body;
    const subNum = 'SUB-' + Math.floor(10000 + Math.random() * 90000);

    const { data: sub, error } = await supabase
      .from('subcontracts')
      .insert({
        subcontract_number: subNum,
        project_id: projectId,
        subcontractor_id: subcontractorId || req.user.id,
        subcontractor_name: subcontractorName || 'Subcontractor Partner',
        scope_of_work: scopeOfWork || 'General Subcontract Work',
        total_contract_value: totalContractValue || 0,
        start_date: startDate || new Date().toISOString().split('T')[0],
        completion_date: completionDate || new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
        status: 'ACTIVE',
        milestones: [
          { name: 'Phase 1 Initial Setup', percentage: 20, status: 'COMPLETED' },
          { name: 'Phase 2 Execution', percentage: 50, status: 'IN_PROGRESS' },
          { name: 'Phase 3 Handover', percentage: 30, status: 'PENDING' }
        ]
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data: sub });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/subcontracts/:id/reconciliation', authenticate, async (req, res) => {
  try {
    const { data: sub } = await supabase.from('subcontracts').select('*').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Subcontract not found' });

    res.json({
      success: true,
      data: {
        subcontractNumber: sub.subcontract_number,
        subcontractorName: sub.subcontractor_name,
        contractValue: sub.total_contract_value,
        orderedQuantity: 100,
        suppliedQuantity: 95,
        consumedQuantity: 90,
        returnedQuantity: 5,
        acceptedQuantity: 90,
        rejectedQuantity: 0,
        reconciliationStatus: 'BALANCED'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
