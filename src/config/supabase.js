// ============================================================
// OH I SEE — Supabase Admin Client (Service Role)
// Used server-side ONLY — never expose to the browser
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    realtime: {
      transport: ws
    }
  }
);

module.exports = supabaseAdmin;
