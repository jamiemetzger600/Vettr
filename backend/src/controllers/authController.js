import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { setAuthCookie, clearAuthCookie, readAuthToken } from '../lib/authCookies.js';
import { sendEmail, isSmtpConfigured } from '../services/emailService.js';

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

const DB_ACTIVE_TIME_QUOTA =
  "Database is temporarily unavailable: the database plan's active-time limit was reached. Upgrade the database or wait for the limit to reset.";

function isDbActiveTimeQuotaError(error) {
  const msg = String(error?.message || '');
  return msg.includes('exceeded the active time quota') || msg.includes('active time quota');
}

// Register new user
export const register = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];

    // Create default user settings
    await pool.query(
      'INSERT INTO user_settings (user_id) VALUES ($1)',
      [user.id]
    );

    // Create default subscription (free)
    await pool.query(
      'INSERT INTO subscriptions (user_id, status, plan) VALUES ($1, $2, $3)',
      [user.id, 'none', 'free']
    );

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    setAuthCookie(res, token, req);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (isDbActiveTimeQuotaError(error)) {
      return res.status(503).json({ error: DB_ACTIVE_TIME_QUOTA });
    }
    res.status(500).json({ error: 'Server error during registration' });
  }
};

// Login
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    // Get user
    const result = await pool.query(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    setAuthCookie(res, token, req);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    if (isDbActiveTimeQuotaError(error)) {
      return res.status(503).json({ error: DB_ACTIVE_TIME_QUOTA });
    }
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Get current user
export const getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/** Re-issue the session cookie from a valid bearer so a top-level OAuth redirect can see the user. */
export const ensureSessionCookie = (req, res) => {
  const { token } = readAuthToken(req);
  if (!token || token.startsWith('vtr_')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  setAuthCookie(res, token, req);
  console.log('[auth] session cookie refreshed for bot connect', { userId: req.user.userId });
  res.json({ ok: true });
};

export const logout = async (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logout successful' });
};

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function webAppBase() {
  const raw =
    process.env.WEB_APP_URL_LOCAL ||
    process.env.WEB_APP_URL ||
    'http://localhost:5173';
  return raw.split(',')[0].trim().replace(/\/+$/, '');
}

export const forgotPassword = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const generic = { message: 'If that email is registered, we sent a reset link.' };

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.json(generic);
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${webAppBase()}/reset-password?token=${token}`;
    const html = `
      <p>Reset your Vettr password using this link (expires in 1 hour):</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `;

    const mail = await sendEmail({
      to: user.email,
      subject: 'Reset your Vettr password',
      html
    });

    console.log('[auth] password reset created', {
      userId: user.id,
      sent: Boolean(mail?.sent),
      smtp: isSmtpConfigured()
    });
    if (!mail?.sent) {
      console.log('[auth] password reset URL (email not sent)', resetUrl);
    }

    const payload = { ...generic };
    return res.json(payload);
  } catch (error) {
    console.error('Forgot password error:', error);
    if (isDbActiveTimeQuotaError(error)) {
      return res.status(503).json({ error: DB_ACTIVE_TIME_QUOTA });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

export const resetPassword = async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const tokenHash = hashResetToken(token);
    const found = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    if (found.rows.length === 0) {
      return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
    }

    const row = found.rows[0];
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, row.user_id]
    );
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [row.id]
    );
    console.log('[auth] password reset completed', { userId: row.user_id });
    res.json({ message: 'Password updated. You can sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    if (isDbActiveTimeQuotaError(error)) {
      return res.status(503).json({ error: DB_ACTIVE_TIME_QUOTA });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

