/**
 * Shared email normalize + format checks for Vettr auth (API + web).
 * Keep messages/behavior aligned across register and forgot-password.
 */

/** Trim + lowercase so login/register lookups match stored emails. */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Practical format check (not full RFC 5322).
 * Rejects missing @, missing domain label, spaces, and empty local/domain parts.
 */
export function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) return false;
  // local@domain.tld — requires at least one dot in the domain
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export const INVALID_EMAIL_MESSAGE = 'Enter a valid email address (for example, you@example.com).';
