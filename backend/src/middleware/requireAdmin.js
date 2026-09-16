/**
 * Scrape-platform admin allowlist.
 * Defaults to jamiemetzger@gmail.com. Override with ADMIN_EMAILS only — never
 * FEEDBACK_ADMIN_EMAILS (that inbox can include other people).
 */
const DEFAULT_SCRAPE_ADMIN = 'jamiemetzger@gmail.com';

export function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || DEFAULT_SCRAPE_ADMIN;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().includes(String(email).trim().toLowerCase());
}

/** Requires authMiddleware first. */
export function requireAdmin(req, res, next) {
  const email = req.user?.email;
  if (!isAdminEmail(email)) {
    console.warn('[admin] scrape denied for', email || '(no email)');
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
