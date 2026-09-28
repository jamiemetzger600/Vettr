import rateLimit from 'express-rate-limit';
import { getClientIp } from '../lib/clientIp.js';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function authRateLimitHandler(_req, res) {
  console.warn('[authRateLimit] 429', {
    path: _req.originalUrl || _req.url,
    ip: getClientIp(_req)
  });
  res.status(429).json({
    error: 'Too many attempts. Please wait a few minutes and try again.'
  });
}

function buildLimiter({ max, name }) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Custom IP key — CF / XFF; skip express-rate-limit's default XFF validator.
    keyGenerator: (req) => `${name}:${getClientIp(req)}`,
    handler: authRateLimitHandler,
    validate: { xForwardedForHeader: false }
  });
}

/** Login / forgot-password / reset-password: 10 per 15 minutes per IP */
export const loginRateLimiter = buildLimiter({ max: 10, name: 'login' });
export const forgotPasswordRateLimiter = buildLimiter({ max: 10, name: 'forgot' });
export const resetPasswordRateLimiter = buildLimiter({ max: 10, name: 'reset' });

/** Register: stricter — 5 per 15 minutes per IP */
export const registerRateLimiter = buildLimiter({ max: 5, name: 'register' });

/** Exported for unit tests (same factory). */
export function createAuthRateLimiter({ max = 10, name = 'test', windowMs = WINDOW_MS } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${getClientIp(req)}`,
    handler: authRateLimitHandler,
    validate: { xForwardedForHeader: false }
  });
}
