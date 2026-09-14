/**
 * Server configuration validation. Load this at startup so missing required
 * env vars fail fast. See CONFIG.md (repo root) for full variable list.
 */

const isProduction = process.env.NODE_ENV === 'production';

const REQUIRED_IN_PRODUCTION = [
  { key: 'DATABASE_URL', hint: 'PostgreSQL connection string (local Postgres on this Mac)' },
  { key: 'JWT_SECRET', hint: 'Generate with: openssl rand -base64 32' },
  { key: 'WEB_APP_URL', hint: 'Cloudflare Pages URL (no trailing slash), for CORS' }
];

const OPTIONAL_BUT_RECOMMENDED = [
  { key: 'STRIPE_SECRET_KEY', hint: 'Required for billing' },
  { key: 'STRIPE_WEBHOOK_SECRET', hint: 'Required for Stripe webhooks' },
  { key: 'STRIPE_MONTHLY_PRICE_ID', hint: 'Stripe Price ID for monthly plan' },
  { key: 'STRIPE_YEARLY_PRICE_ID', hint: 'Stripe Price ID for yearly plan' },
  { key: 'SMTP_HOST', hint: 'Required for email notifications' },
  { key: 'VAPID_PUBLIC_KEY', hint: 'Web Push public key (npx web-push generate-vapid-keys)' },
  { key: 'VAPID_PRIVATE_KEY', hint: 'Web Push private key — keep secret' },
  { key: 'GOOGLE_CALENDAR_CLIENT_ID', hint: 'Required for CRM Google Calendar OAuth' },
  { key: 'GOOGLE_CALENDAR_CLIENT_SECRET', hint: 'Required for CRM Google Calendar OAuth' }
];

function validateConfig() {
  const missing = [];
  if (isProduction) {
    for (const { key, hint } of REQUIRED_IN_PRODUCTION) {
      const value = process.env[key];
      if (!value || String(value).trim() === '') {
        missing.push({ key, hint });
      }
    }
    if (missing.length > 0) {
      console.error('Missing required environment variables (production):');
      missing.forEach(({ key, hint }) => console.error(`  - ${key}: ${hint}`));
      process.exit(1);
    }
  }

  for (const { key, hint } of OPTIONAL_BUT_RECOMMENDED) {
    const value = process.env[key];
    if (!value || String(value).trim() === '') {
      console.warn(`[config] Optional env not set: ${key} — ${hint}`);
    }
  }

  if (process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() && process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()) {
    console.log('[config] Google Calendar OAuth configured');
    if (isProduction) {
      const apiBase = (process.env.API_BASE_URL || '').trim();
      if (!apiBase || /localhost|127\.0\.0\.1/i.test(apiBase)) {
        console.error('[config] Google OAuth requires public API_BASE_URL in production (not localhost).');
        process.exit(1);
      }
      const web = (process.env.WEB_APP_URL || '').trim();
      if (/localhost|127\.0\.0\.1/i.test(web)) {
        console.error('[config] WEB_APP_URL cannot be localhost in production (Google OAuth callback).');
        process.exit(1);
      }
    }
  }
}

export { validateConfig };
