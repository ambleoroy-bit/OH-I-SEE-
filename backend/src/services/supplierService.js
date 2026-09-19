// ============================================================
// Service: Supplier & Vendor Onboarding Service
// Flow: Public Vendor Registration -> DB (PENDING_REVIEW) -> Admin Approval -> Active Vendor 360
// ============================================================

const supabase = require('../config/supabase');

class SupplierService {

  // 1. Submit Vendor Onboarding Application
  static async submitOnboarding({
    userId, companyName, legalEntityType, yearEstablished, businessEmail, contactPhone,
    website, officeAddress, city, state, pincode, gstin, pan, msmeRegNo,
    bankName, bankAccountNo, ifscCode, bankBranch, categories, brands, servicePincodes,
    gstDocUrl, panDocUrl, chequeDocUrl
  }) {
    if (!userId || !companyName || !gstin || !businessEmail || !contactPhone || !bankAccountNo || !bankName || !ifscCode || !pan || !officeAddress || !city || !pincode) {
      throw new Error('Complete your business identity, address and bank details before submitting.');
    }

    const { data: profile, error } = await supabase
      .from('supplier_profiles')
      .insert({
        user_id: userId || null,
        company_name: companyName,
        legal_entity_type: legalEntityType || 'Private Limited',
        year_established: yearEstablished || null,
        business_email: businessEmail,
        contact_phone: contactPhone,
        website: website || '',
        office_address: officeAddress,
        city: city,
        state: state || 'Tamil Nadu',
        pincode: pincode,
        gstin: gstin,
        pan: pan,
        msme_reg_no: msmeRegNo || '',
        bank_name: bankName,
        bank_account_no: bankAccountNo,
        ifsc_code: ifscCode,
        bank_branch: bankBranch || null,
        categories: categories || [],
        brands: brands || [],
        service_pincodes: servicePincodes || [],
        gst_doc_url: gstDocUrl || '',
        pan_doc_url: panDocUrl || '',
        cheque_doc_url: chequeDocUrl || '',
        status: 'PENDING_REVIEW'
      })
      .select()
      .single();

    if (error) throw new Error('Failed to submit onboarding application: ' + error.message);

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: userId || null,
      actor_name: companyName,
      entity_name: 'supplier_profiles',
      entity_id: profile.id,
      action: 'VENDOR_ONBOARDING_SUBMITTED',
      details: { gstin, categories }
    });

    return profile;
  }

  // 2. Fetch Pending Vendor Applications Queue (Admin/Procurement Manager)
  static async getOnboardingRequests() {
    const { data: requests, error } = await supabase
      .from('supplier_profiles')
      .select('*')
      .in('status', ['PENDING_REVIEW', 'UNDER_REVIEW'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return requests || [];
  }

  // 3. Approve Vendor Application
  static async approveSupplier(supplierId, adminId) {
    const { data: supplier, error: fetchErr } = await supabase
      .from('supplier_profiles')
      .select('*')
      .eq('id', supplierId)
      .single();

    if (fetchErr || !supplier) throw new Error('Supplier profile not found');

    const { data: approved, error } = await supabase
      .from('supplier_profiles')
      .update({
        status: 'APPROVED',
        review_notes: 'Approved by Administrator after compliance verification.',
        updated_at: new Date()
      })
      .eq('id', supplierId)
      .select()
      .single();

    if (error) throw new Error('Failed to approve supplier: ' + error.message);

    // Update user role if linked to a user_id
    if (supplier.user_id) {
      await supabase.from('users').update({ role: 'Supplier', partner_status: 'approved' }).eq('id', supplier.user_id);
    }

    // Audit Log
    await supabase.from('audit_logs').insert({
      actor_id: adminId || null,
      entity_name: 'supplier_profiles',
      entity_id: supplierId,
      action: 'VENDOR_ONBOARDING_APPROVED',
      details: { companyName: supplier.company_name, approvedAt: new Date() }
    });

    return approved;
  }

  // 4. Reject Vendor Application
  static async rejectSupplier(supplierId, adminId, reason) {
    const { data: rejected, error } = await supabase
      .from('supplier_profiles')
      .update({
        status: 'REJECTED',
        review_notes: reason || 'GSTIN verification or compliance documents failed verification.',
        updated_at: new Date()
      })
      .eq('id', supplierId)
      .select()
      .single();

    if (error) throw new Error('Failed to reject supplier: ' + error.message);

    await supabase.from('audit_logs').insert({
      actor_id: adminId || null,
      entity_name: 'supplier_profiles',
      entity_id: supplierId,
      action: 'VENDOR_ONBOARDING_REJECTED',
      details: { reason }
    });

    return rejected;
  }

  static async getAllSuppliers() {
    const {data,error}=await supabase.from('supplier_profiles')
      .select('id,company_name,legal_entity_type,year_established,website,city,state,categories,brands,rating,status')
      .eq('status','APPROVED').order('created_at',{ascending:false});
    if(error) throw new Error('Supplier directory unavailable.');
    return data || [];
  }

  // 6. Fetch Single Supplier Profile 360 View
  static async getSupplierProfile(supplierId) {
    const { data: supplier, error } = await supabase
      .from('supplier_profiles')
      .select('id,company_name,legal_entity_type,year_established,website,city,state,categories,brands,rating,status')
      .eq('id', supplierId)
      .eq('status','APPROVED')
      .single();

    if (error || !supplier) throw new Error('Supplier not found');

    return supplier;
  }
}

module.exports = SupplierService;
