# Server & environment configuration

Single reference for all environment variables and deployment config. Copy the relevant `.env.example` files to `.env` (or set in the platform dashboard) and fill in values.

---

## Backend (Node.js on this Mac)

**Source:** [backend/.env.example](backend/.env.example)  
**Used by:** `backend/src` (Express, DB, Stripe, email, Airtable scraper)

| Variable | Required | Default / example | Notes |
|----------|----------|-------------------|--------|
| `NODE_ENV` | No | `development` | LaunchAgent uses `development` |
| `PORT` | No | `3001` | Local API; public traffic hits the Worker proxy then the tunnel |
| `DATABASE_URL` | **Yes** (prod) | `postgresql://user:pass@host:5432/vettr` | Local PostgreSQL on this Mac |
| `JWT_SECRET` | **Yes** | — | Generate: `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiry |
| `WEB_APP_URL` | **Yes** (prod) | `http://localhost:5173` | Cloudflare Pages URL, no trailing slash (CORS) |
| `STRIPE_SECRET_KEY` | Yes (billing) | `sk_test_...` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | Yes (webhooks) | `whsec_...` | From Stripe Webhooks → Add endpoint |
| `STRIPE_MONTHLY_PRICE_ID` | Yes (checkout) | `price_...` | Stripe Price ID for monthly plan |
| `STRIPE_YEARLY_PRICE_ID` | Yes (checkout) | `price_...` | Stripe Price ID for yearly plan |
| `SMTP_HOST` | No | `smtp.gmail.com` | Omit to disable email (notifications) |
| `SMTP_PORT` | No | `587` | |
| `SMTP_USER` | No | — | With SMTP_HOST for sending |
| `SMTP_PASS` | No | — | Gmail: [App Password](https://support.google.com/accounts/answer/185833) |
| `VAPID_PUBLIC_KEY` | No | — | Web Push public key for desktop/PWA alerts. Generate: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | No | — | Web Push private key (secret). Pair with the public key. |
| `VAPID_SUBJECT` | No | `mailto:` + `SMTP_USER` | Contact URL or mailto used in VAPID. |
| `DIGEST_TZ` | No | `America/Los_Angeles` | Timezone for the 9:00 AM daily/weekly summary email |
| `GOOGLE_CALENDAR_CLIENT_ID` | No | — | OAuth Web client ID. Enables Connect Google (Calendar + Gmail send). Enable **Gmail API** and **Google Calendar API** on the same Cloud project. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | No | — | OAuth client secret. Redirect URI: `{API_BASE_URL}/api/crm/calendar/oauth/callback` |
| `LLM_CREDENTIALS_KEY` | No | falls back to `JWT_SECRET` | AES-256-GCM key for Off Market BYO LLM API keys. Generate: `openssl rand -base64 32` |
| `AIRTABLE_SHARE_URL` | No | (hardcoded fallback) | Airtable shared view URL for scraper |
| `AIRTABLE_SCRAPE_CRON` | No | `0 4 * * *` | Cron expression; interpreted in `AIRTABLE_SCRAPE_CRON_TZ` |
| `AIRTABLE_SCRAPE_CRON_TZ` | No | `America/Los_Angeles` | IANA timezone for the cron schedule |
| `AIRTABLE_SCRAPE_ENABLED` | No | `true` | `false` to disable scraper |
| `AIRTABLE_SCRAPE_ON_STARTUP` | No | `true` | `false` to skip the scrape 5s after server boot (saves one full Airtable pull per cold start) |
| `SCRAPE_TRIGGER_SECRET` | **Yes** (prod + cron) | — | Protects `POST /api/airtable-deals/scrape`. Same value in GitHub secret `SCRAPE_TRIGGER_SECRET`. Generate: `openssl rand -base64 32` |
| `NODE_OPTIONS` | No | (via npm start) | LaunchAgent sets `--max-old-space-size=768` if scrape OOMs |
| `MARKET_DEALS_PRUNE_ENABLED` | No | `true` | `false` to skip deactivating stale listings after each Airtable scrape |
| `MARKET_DEALS_MAX_AGE_MONTHS` | No | `6` | Listings with no newer activity than this are set `is_active = false` |

---

## Web (Vite / Cloudflare Pages)

**Source:** [web/.env.example](web/.env.example)  
**Used by:** `web/src` (Vite bakes `VITE_*` at build time)

| Variable | Required | Default / example | Notes |
|----------|----------|-------------------|--------|
| `VITE_API_URL` | **Yes** (prod) | — | Stable Worker **including** `/api`: `https://vettr-api.metzgerbuildsthings.workers.dev/api`. Omit in dev to use Vite proxy. Never bake a `trycloudflare.com` URL into Pages. |
| `VITE_EXTENSION_ID` | **Yes** (prod, web→ext link) | — | Chrome extension ID so logged-in web users auto-link the extension. See [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md). |
| `VITE_CHROME_STORE_URL` | No (until listing live) | — | Full Chrome Web Store URL for Install buttons in Settings / Get the app. |

---

## CLI (agents / scripts)

**Source:** [.env.cli.example](.env.cli.example)  
**Used by:** Wrangler (Cloudflare Pages). Copy to `.env.cli` (gitignored).

| Variable | Required | Notes |
|----------|----------|--------|
| `CLOUDFLARE_ACCOUNT_ID` | Yes (Wrangler) | Dashboard → right sidebar |
| `CLOUDFLARE_API_TOKEN` | Yes (Wrangler) | My Profile → API Tokens → “Edit Cloudflare Workers” |

Load before Wrangler: `source .env.cli` then `wrangler pages ...`.

---

## Deployment

- **Backend:** this Mac (`com.vettr.api` on port `3001`), exposed via Cloudflare tunnel + Worker proxy. Env lives in `backend/.env`. See [DEPLOY.md](DEPLOY.md).
- **Frontend:** Cloudflare Pages — Settings → Environment variables; `VITE_API_URL` must be the Worker `/api` URL. Push to `main` auto-deploys.
- **Database:** local PostgreSQL; `DATABASE_URL` in `backend/.env`. Migrations run when the API starts.

---

## Validation

The backend validates config at startup (`backend/src/config.js`): in production it exits if `DATABASE_URL`, `JWT_SECRET`, or `WEB_APP_URL` are missing; optional vars (Stripe, SMTP) are only logged as warnings.
