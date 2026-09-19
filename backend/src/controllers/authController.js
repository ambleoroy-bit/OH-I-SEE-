// ============================================================
// Auth Controller — Signup, Login, Logout, Password Reset
// ============================================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const supabase = require('../config/supabase'); // Singleton client (bypasses RLS)
const { ensureContractorProfile } = require('../services/contractorProfile');
const { getUserExtras, setUserExtras } = require('../services/userProfileStore');

function supabaseConfigured() {
  const url = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && !url.includes('placeholder') && serviceKey && serviceKey !== 'placeholder';
}

// Admin client — user management, email confirm, password reset
function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: ws },
    }
  );
}

// Sign-in client — must use anon key for reliable password verification
function getSignInClient() {
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
  return createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    key,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: ws },
    }
  );
}

function getAuthClient() {
  return getAdminClient();
}

function gmailLocalKey(email) {
  const [local, domain] = String(email || '').toLowerCase().split('@');
  if (!local || !domain) return String(email || '').toLowerCase();
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.replace(/\./g, '')}@${domain}`;
  }
  return `${local}@${domain}`;
}

function uniqueEmails(...values) {
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const e = String(raw || '').trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

async function findAuthUserByEmail(admin, email) {
  const target = String(email || '').trim().toLowerCase();
  const targetKey = gmailLocalKey(target);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users || [];
    const match = users.find((u) => {
      const ue = String(u.email || '').toLowerCase();
      return ue === target || gmailLocalKey(ue) === targetKey;
    });
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
}

async function ensureEmailConfirmed(admin, authUser) {
  if (!authUser?.id) return;
  if (authUser.email_confirmed_at || authUser.confirmed_at) return;
  await admin.auth.admin.updateUserById(authUser.id, { email_confirm: true });
}

async function resolveAuthIdentity(email) {
  const admin = getAdminClient();
  const normalized = String(email || '').trim().toLowerCase();

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role, partner_type')
    .eq('email', normalized)
    .maybeSingle();

  let authUser = null;
  if (profile?.id) {
    const { data: byId } = await admin.auth.admin.getUserById(profile.id);
    authUser = byId?.user || null;
  }
  if (!authUser) {
    authUser = await findAuthUserByEmail(admin, normalized);
  }

  const loginEmails = uniqueEmails(
    authUser?.email,
    profile?.email,
    normalized,
  );

  return { profile, authUser, loginEmails };
}

async function attemptPasswordSignIn(signInClient, emails, password) {
  let lastError = null;
  for (const loginEmail of emails) {
    const { data, error } = await signInClient.auth.signInWithPassword({
      email: loginEmail,
      password,
    });
    if (!error) return { data, error: null };
    lastError = error;
  }
  return { data: null, error: lastError };
}

function frontendLoginUrl() {
  const base = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/pages/login.html`;
}

function generateToken(userId, role) {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function formatAuthUser(profile) {
  const gstin = String(profile?.gstin || profile?.gst || '').trim();
  const userExtras = profile?.id ? getUserExtras(profile.id) : {};
  const image = profile?.profile_image || profile?.company_logo || userExtras.profile_image || '';
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    phone: profile.phone,
    company: profile.company,
    gstin,
    partner_type: profile.partner_type,
    partner_status: profile.partner_status,
    partner_tier: profile.partner_tier,
    reward_points_available: profile.reward_points_available,
    referral_code: profile.referral_code,
    city: profile.city,
    state: profile.state,
    profile_image: image,
    company_logo: image
  };
}

// POST /api/auth/signup
async function signup(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(err => err.msg).join(', ');
    return res.status(400).json({ error: errorMsg, errors: errors.array() });
  }

  const { name, email, password, phone, role = 'Customer' } = req.body;
  const accountType = req.body.accountType || (role === 'Partner' ? 'Partner' : 'Customer');
  if (!['Customer','Partner','Contractor','Vendor','Supplier'].includes(accountType)) return res.status(400).json({error:'Choose Customer, Contractor, Vendor or Supplier.'});
  const provider = role === 'Partner';
  if (!provider && accountType !== 'Customer') return res.status(400).json({error:'Provider accounts must use Partner registration.'});
  const business = req.body.business || {};
  const allowedBusiness = ['company','gst','gstin','pan','address','city','state','pincode'];
  if (allowedBusiness.some(k => business[k] != null && (typeof business[k] !== 'string' || business[k].length > 250))) return res.status(400).json({error:'Invalid business profile.'});

  const providerCity = String(req.body.city || business.city || '').trim();
  const providerState = String(req.body.state || business.state || 'Tamil Nadu').trim();
  const providerCompany = String(business.company || '').trim();
  const providerGstin = String(business.gstin || business.gst || '').trim().toUpperCase();
  if (provider && ['Contractor', 'Vendor', 'Supplier'].includes(accountType) && !providerCity) {
    return res.status(400).json({ error: 'Service city is required for contractors and vendors.' });
  }
  if (provider && ['Contractor', 'Vendor', 'Supplier'].includes(accountType) && !providerCompany) {
    return res.status(400).json({ error: 'Company name is required for contractors and vendors.' });
  }
  if (provider && ['Contractor', 'Vendor', 'Supplier'].includes(accountType) && providerGstin.length !== 15) {
    return res.status(400).json({ error: 'A valid 15-character GSTIN is required.' });
  }
  if (provider && ['Contractor', 'Vendor', 'Supplier'].includes(accountType) && !String(phone || '').trim()) {
    return res.status(400).json({ error: 'Phone number is required for contractors and vendors.' });
  }

  let createdAuthId = null;
  if (!['Customer', 'Partner'].includes(role)) return res.status(400).json({ error: 'Privileged roles cannot be assigned during registration.' });

  try {
    // Check for duplicate email (using RLS-bypassing client)
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email already registered. Please login instead.' });
    }



    // Create Supabase auth user using transient client
    const authClient = getAuthClient();
    const { data: authData, error: authError } = await authClient.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      user_metadata: { name, role, account_type: accountType },
      email_confirm: true // Confirm email automatically so they can log in
    });

    if (authError) throw authError;
    createdAuthId = authData.user.id;

    const profileImage = String(req.body.profile_image || req.body.company_logo || req.body.business?.profile_image || '').trim();
    if (profileImage) {
      setUserExtras(authData.user.id, { profile_image: profileImage });
    }

    const referralCode = 'OHI-' + Math.random().toString(36).toUpperCase().slice(2, 10);
    const userPayload = {
      id: authData.user.id,
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      role,
      referral_code: referralCode,
      ...(provider ? {
        partner_type: accountType,
        partner_status: 'pending',
        city: providerCity || business.city?.trim() || null,
        state: providerState || business.state?.trim() || null,
        company: providerCompany || null,
        gstin: providerGstin || null,
        gst: providerGstin || null,
        ...(business.pan ? { pan: business.pan.trim() } : {}),
        ...(business.address ? { address: business.address.trim() } : {}),
        ...(business.pincode ? { pincode: business.pincode.trim() } : {})
      } : {})
    };

    // Try upserting with profile_image first
    let { data: profile, error: profileError } = await supabase
      .from('users')
      .upsert(profileImage ? { ...userPayload, profile_image: profileImage } : userPayload, { onConflict: 'id' })
      .select()
      .single();

    // Fall back to upserting without profile_image field if DB column is missing or payload rejected
    if (profileError && profileImage) {
      console.warn('Supabase DB upsert with profile_image failed, retrying without DB column:', profileError.message);
      const retry = await supabase
        .from('users')
        .upsert(userPayload, { onConflict: 'id' })
        .select()
        .single();
      profile = retry.data;
      profileError = retry.error;
    }

    if (profileError) throw profileError;

    try {
      await ensureContractorProfile(profile);
    } catch (profileSetupError) {
      console.warn('Contractor profile setup skipped:', profileSetupError.message);
    }

    const token = generateToken(profile.id, profile.role);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: formatAuthUser(profile)
    });
  } catch (err) {
    if (createdAuthId) await supabase.auth.admin.deleteUser(createdAuthId).catch(()=>{});
    console.error('Signup failed:', err.message || err.code || err.status || 'PROFILE_ERROR', err);
    const duplicate = err.status === 422 || err.code === 'email_exists' || err.code === '23505' || /already registered|exists/i.test(err.message || '');
    res.status(duplicate ? 409 : 503).json({
      error: duplicate
        ? 'This email is already registered. Please sign in or reset your password.'
        : (err.message || 'Registration could not be completed. Please retry; no successful account is being claimed.')
    });
  }
}

// POST /api/auth/login
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(err => err.msg).join(', ');
    return res.status(400).json({ error: errorMsg, errors: errors.array() });
  }

  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;

  if (!supabaseConfigured()) {
    return res.status(503).json({
      error: 'Authentication service is not configured.',
      hint: 'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY in the server .env file.',
    });
  }

  try {
    const admin = getAdminClient();
    const signInClient = getSignInClient();
    const { profile: existingProfile, authUser, loginEmails } = await resolveAuthIdentity(email);

    if (authUser) {
      await ensureEmailConfirmed(admin, authUser);
    }

    let { data: authData, error: authError } = await attemptPasswordSignIn(signInClient, loginEmails, password);

    // Repair: profile exists but auth user missing — recreate auth with the same user id
    if (authError && existingProfile && !authUser) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        id: existingProfile.id,
        email: loginEmails[0] || email,
        password,
        email_confirm: true,
        user_metadata: {
          name: existingProfile.name,
          role: existingProfile.role,
          account_type: existingProfile.partner_type || existingProfile.role,
        },
      });
      if (!createErr) {
        ({ data: authData, error: authError } = await attemptPasswordSignIn(
          signInClient,
          uniqueEmails(created?.user?.email, email),
          password,
        ));
      } else {
        console.warn('Auth repair createUser failed:', createErr.message);
      }
    }

    if (authError) {
      console.log('LOGIN_FAILED:', email, authError.message, authError.status || '');
      if (existingProfile || authUser) {
        const unconfirmed = /confirm|verified/i.test(authError.message || '');
        return res.status(401).json({
          error: unconfirmed
            ? 'Email address is not verified yet.'
            : 'Invalid email or password.',
          hint: unconfirmed
            ? 'We attempted to verify your email. Try logging in again, or use Forgot Password.'
            : 'This email is registered. Click Forgot Password below to reset your password.',
        });
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    console.log('AUTH_SUCCESS:', authData.user.email);

    // Fetch user profile (using RLS-bypassing client)
    let { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') return res.status(503).json({error:'Account service temporarily unavailable. Please retry.'});
    if (!profile) {
      console.log('PROFILE_MISSING:', authData.user.id);

      // Auto-create missing profile
      const name = authData.user.user_metadata?.name || authData.user.email.split('@')[0];
      const role = authData.user.user_metadata?.role === 'Partner' ? 'Partner' : 'Customer';
      const referralCode = 'OHI-' + Math.random().toString(36).toUpperCase().slice(2, 10);

      const { data: newProfile, error: createError } = await supabase
        .from('users')
        .insert([{
          id: authData.user.id,
          name,
          email: authData.user.email,
          role,
          referral_code: referralCode,
          ...(role === 'Partner' ? {partner_status:'pending',partner_type:['Contractor','Vendor','Supplier','Partner'].includes(authData.user.user_metadata?.account_type)?authData.user.user_metadata.account_type:'Partner'} : {})
        }])
        .select()
        .single();

      if (createError) {
        console.error('Failed to auto-create profile:', createError);
        return res.status(500).json({ error: 'Failed to initialize user profile. Please try again.' });
      }

      profile = newProfile;
      console.log('PROFILE_CREATED:', profile.id);
    } else {
      console.log('PROFILE_FOUND:', profile.id);
    }

    try {
      await ensureContractorProfile(profile);
    } catch (profileSetupError) {
      console.warn('Contractor profile setup skipped:', profileSetupError.message);
    }

    const token = generateToken(profile.id, profile.role);
    console.log('SESSION_CREATED:', profile.id);
    console.log('LOGIN_SUCCESS:', profile.email);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      session: {
        access_token: token,
        token_type: 'bearer',
        expires_in: 604800 // 7 days
      },
      user: formatAuthUser(profile)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// POST /api/auth/logout
async function logout(req, res) {
  res.json({ message: 'Logged out successfully.' });
}

// POST /api/auth/forgot-password
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    if (!supabaseConfigured()) {
      return res.status(503).json({ error: 'Authentication service is not configured.' });
    }
    const admin = getAdminClient();
    const normalized = String(email || '').trim().toLowerCase();
    const { authUser, loginEmails } = await resolveAuthIdentity(normalized);
    const targetEmail = loginEmails[0] || normalized;

    if (authUser) await ensureEmailConfirmed(admin, authUser);

    const { error } = await admin.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${frontendLoginUrl()}#type=recovery`,
    });
    if (error) console.warn('forgot-password:', error.message);

    res.json({ message: 'If this email is registered, a reset link has been sent.' });
  } catch (err) {
    console.warn('forgot-password error:', err.message);
    res.json({ message: 'If this email is registered, a reset link has been sent.' });
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res) {
  const { access_token, new_password } = req.body;
  if (!access_token || !new_password) {
    return res.status(400).json({ error: 'Access token and new password are required.' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const authClient = getAuthClient();
    const { data: verified, error: tokenError } = await authClient.auth.getUser(access_token);
    if (tokenError || !verified?.user?.id) return res.status(401).json({ error: 'Invalid or expired password reset session.' });
    const { error } = await authClient.auth.admin.updateUserById(
      verified.user.id,
      { password: new_password }
    );
    if (error) throw error;
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to reset password.' });
  }
}

// GET /api/auth/me
async function getMe(req, res) {
  res.json({ user: formatAuthUser(req.user) });
}

module.exports = { signup, login, logout, forgotPassword, resetPassword, getMe };
