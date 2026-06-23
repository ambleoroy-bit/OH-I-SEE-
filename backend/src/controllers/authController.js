// ============================================================
// Auth Controller — Signup, Login, Logout, Password Reset
// ============================================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const supabase = require('../config/supabase'); // Singleton client (bypasses RLS)

// Helper to get a clean, transient Supabase client instance for authentication
function getAuthClient() {
  return createClient(
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
}

function generateToken(userId, role) {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/signup
async function signup(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(err => err.msg).join(', ');
    return res.status(400).json({ error: errorMsg, errors: errors.array() });
  }

  const { name, email, password, phone, role = 'Customer' } = req.body;

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

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create Supabase auth user using transient client
    const authClient = getAuthClient();
    const { data: authData, error: authError } = await authClient.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      user_metadata: { name, role },
      email_confirm: true // Confirm email automatically so they can log in
    });

    if (authError) throw authError;

    // Upsert profile (using RLS-bypassing client)
    const referralCode = 'OHI-' + Math.random().toString(36).toUpperCase().slice(2, 10);
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .upsert({
        id: authData.user.id,
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        role: ['Customer', 'Partner', 'Admin', 'Super Admin'].includes(role) ? role : 'Customer',
        referral_code: referralCode
      }, { onConflict: 'id' })
      .select()
      .single();

    if (profileError) throw profileError;

    const token = generateToken(profile.id, profile.role);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        phone: profile.phone
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message || 'Signup failed. Please try again.' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(err => err.msg).join(', ');
    return res.status(400).json({ error: errorMsg, errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Sign in via Supabase Auth using a transient client to prevent state contamination
    const authClient = getAuthClient();
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    });

    if (authError) {
      console.log('LOGIN_FAILED:', email, authError.message);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    console.log('AUTH_SUCCESS:', authData.user.email);

    // Fetch user profile (using RLS-bypassing client)
    let { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      console.log('PROFILE_MISSING:', authData.user.id);

      // Auto-create missing profile
      const name = authData.user.user_metadata?.name || authData.user.email.split('@')[0];
      const role = authData.user.user_metadata?.role || 'Customer';
      const referralCode = 'OHI-' + Math.random().toString(36).toUpperCase().slice(2, 10);

      const { data: newProfile, error: createError } = await supabase
        .from('users')
        .insert([{
          id: authData.user.id,
          name,
          email: authData.user.email,
          role,
          referral_code: referralCode,
          partner_status: role === 'Partner' ? 'pending' : undefined
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
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        phone: profile.phone,
        company: profile.company,
        partner_status: profile.partner_status,
        partner_tier: profile.partner_tier,
        reward_points_available: profile.reward_points_available,
        referral_code: profile.referral_code
      }
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
    const authClient = getAuthClient();
    const { error } = await authClient.auth.resetPasswordForEmail(email.toLowerCase(), {
      redirectTo: `${process.env.FRONTEND_URL}/login.html#reset`
    });

    res.json({ message: 'If this email is registered, a reset link has been sent.' });
  } catch (err) {
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
    const { error } = await authClient.auth.admin.updateUserById(
      JSON.parse(Buffer.from(access_token.split('.')[1], 'base64').toString()).sub,
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
  res.json({ user: req.user });
}

module.exports = { signup, login, logout, forgotPassword, resetPassword, getMe };
