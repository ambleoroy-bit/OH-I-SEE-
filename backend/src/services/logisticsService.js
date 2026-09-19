// ============================================================
// Service: Logistics Service
// Flow: PO Approved -> Shipment Dispatched -> Gate Entry -> GRN -> Inventory Transaction
// ============================================================

const supabase = require('../config/supabase');

class LogisticsService {

  // 1. Create Shipment (Supplier ASN)
  static async createShipment({ poId, supplierId, vehicleNumber, driverName, driverPhone, items }) {
    const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', poId).single();
    if (!po) throw new Error('Purchase Order not found');

    const shipmentNumber = 'SHP-' + Math.floor(10000 + Math.random() * 90000);

    const { data: shipment, error } = await supabase
      .from('shipments')
      .insert({
        shipment_number: shipmentNumber,
        po_id: poId,
        supplier_id: supplierId || po.supplier_id,
        vehicle_number: vehicleNumber || 'TN-37-AB-1234',
        driver_name: driverName || 'Rajesh Kumar',
        driver_phone: driverPhone || '+91 98765 43210',
        dispatch_date: new Date().toISOString(),
        expected_arrival: new Date(Date.now() + 2 * 86400000).toISOString(),
        tracking_number: 'TRK-' + Math.floor(100000 + Math.random() * 900000),
        status: 'DISPATCHED',
        items: items || po.items || []
      })
      .select()
      .single();

    if (error) throw new Error('Failed to create shipment: ' + error.message);
    return shipment;
  }

  // 2. Gate Entry Security Verification
  static async recordGateEntry({ shipmentId, poNumber, vehicleNumber, driverName, supplierName, securityOfficer }) {
    const geNumber = 'GE-' + Math.floor(10000 + Math.random() * 90000);

    const { data: gateEntry, error } = await supabase
      .from('gate_entries')
      .insert({
        gate_entry_number: geNumber,
        shipment_id: shipmentId || null,
        po_number: poNumber,
        vehicle_number: vehicleNumber,
        driver_name: driverName || 'Driver',
        supplier_name: supplierName || 'Supplier',
        entry_time: new Date().toISOString(),
        security_officer: securityOfficer || 'Security Officer A. Kumar',
        status: 'ENTERED'
      })
      .select()
      .single();

    if (error) throw new Error('Failed to record gate entry: ' + error.message);

    if (shipmentId) {
      await supabase.from('shipments').update({ status: 'ARRIVED' }).eq('id', shipmentId);
    }

    return gateEntry;
  }

  // 3. Goods Receipt Note (GRN) & Quality Inspection
  static async createGRN({ poId, gateEntryId, receivedBy, inspectionStatus, items }) {
    const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', poId).single();
    if (!po) throw new Error('Purchase Order not found');

    const grnNumber = 'GRN-' + Math.floor(10000 + Math.random() * 90000);
    const finalItems = items || po.items || [];

    const { data: grn, error: grnErr } = await supabase
      .from('goods_receipts')
      .insert({
        grn_number: grnNumber,
        po_id: poId,
        gate_entry_id: gateEntryId || null,
        project_id: po.project_id,
        received_by: receivedBy || 'Warehouse Incharge',
        inspection_status: inspectionStatus || 'PASSED',
        items: finalItems
      })
      .select()
      .single();

    if (grnErr) throw new Error('Failed to create Goods Receipt Note: ' + grnErr.message);

    // Update PO Status to RECEIVED
    await supabase.from('purchase_orders').update({ status: 'RECEIVED' }).eq('id', poId);

    // Update Gate Entry Status if present
    if (gateEntryId) {
      await supabase.from('gate_entries').update({ status: 'INSPECTED', exit_time: new Date().toISOString() }).eq('id', gateEntryId);
    }

    // Auto-update Project Inventory
    for (const item of finalItems) {
      const qty = Number(item.quantity || 1);
      const itemName = item.name || item.item_name || 'Material Item';
      const category = item.category || 'Construction Materials';

      const { data: existing } = await supabase
        .from('inventory')
        .select('*')
        .eq('project_id', po.project_id)
        .eq('item_name', itemName)
        .single();

      if (existing) {
        await supabase
          .from('inventory')
          .update({
            quantity_available: Number(existing.quantity_available || 0) + qty,
            updated_at: new Date()
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('inventory')
          .insert({
            project_id: po.project_id,
            item_name: itemName,
            category: category,
            quantity_available: qty,
            unit: item.unit || 'Units'
          });
      }
    }

    return grn;
  }
}

module.exports = LogisticsService;
