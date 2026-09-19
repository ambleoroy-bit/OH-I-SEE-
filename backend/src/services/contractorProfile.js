'use strict';
const supabase = require('../config/supabase');

const CONTRACTOR_PROFESSIONS = {
  Contractor: 'General Contractor',
  Vendor: 'Civil Contractor'
};

async function ensureContractorProfile(user) {
  const partnerType = user.partner_type;
  if (user.role !== 'Partner' || !['Contractor', 'Vendor'].includes(partnerType)) {
    return null;
  }

  const profession = CONTRACTOR_PROFESSIONS[partnerType] || 'General Contractor';
  const autoVerify = process.env.CONSTRUCTION_AUTO_VERIFY === 'true' || process.env.NODE_ENV !== 'production';

  const row = {
    id: user.id,
    name: user.name || user.email?.split('@')[0] || 'Contractor',
    profession,
    company: user.company || '',
    city: user.city || 'Coimbatore',
    bio: `${profession} registered on OH I SEE. Complete your profile to improve matching.`,
    experience_years: 1,
    service_radius_km: 50,
    available: true,
    rate_unit: 'project',
    verification: autoVerify ? 'verified' : 'pending',
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: readError } = await supabase
    .from('construction_professionals')
    .select('id,verification,available,profession,city')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    if (readError.code === 'PGRST205') return null;
    throw readError;
  }

  if (existing) return existing;

  const { data, error } = await supabase
    .from('construction_professionals')
    .upsert(row, { onConflict: 'id' })
    .select('id,verification,available,profession,city')
    .single();

  if (error) {
    if (error.code === 'PGRST205') return null;
    throw error;
  }

  return data;
}

module.exports = { ensureContractorProfile, CONTRACTOR_PROFESSIONS };
