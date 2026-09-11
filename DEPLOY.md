# Vettr — Production Deployment Guide

For a single list of all environment variables (backend, web, CLI), see **[CONFIG.md](CONFIG.md)**.

## Stack

| Layer | Service | Notes |
|--------|---------|-------|
| Frontend | Cloudflare Pages | Auto-deploy on push to `main` (prod). Branch `staging` → `https://staging.vettr.pages.dev`. PR/branch previews → `https://*.vettr.pages.dev`. |
| Public API | Worker `vettr-api` (`workers/vettr-api-proxy`) | Stable URL: `https://vettr-api.metzgerbuildsthings.workers.dev` |
| Backend | This Mac (`com.vettr.api` → `:3001`) | Exposed by Cloudflare quick tunnel (`com.vettr.tunnel`) |
| Database | Local PostgreSQL | `DATABASE_URL` in `backend/.env` |

Koyeb is retired. Do not create Koyeb services or run the Koyeb CLI.

---

## Prerequisites

- GitHub repo pushed and up to date
- Stripe account (test keys for staging, live keys for launch)
- Email SMTP credentials (Gmail App Password, Resend, or similar)

---

## Frontend — Cloudflare Pages

1. Go to [cloudflare.com](https://cloudflare.com) → Workers & Pages → Create → Pages
2. Connect your GitHub repo
3. Build settings:
   - **Root directory:** `web`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Environment variables (required for deals to load):
   - `VITE_API_URL` = `https://vettr-api.metzgerbuildsthings.workers.dev/api` (stable Worker proxy — never a `trycloudflare.com` URL)
   - Without this, the app will show "Total: 0 Deals" because it will request `/api/airtable-deals` on the Pages host (which has no API). Set the variable in Cloudflare Pages → your project → Settings → Environment variables, then trigger a new build.
5. Deploy — your app will be live at `https://your-project.pages.dev`
6. **SPA routing:** With no root `404.html`, Cloudflare Pages already sends unknown paths to your React app. Do not add a `/* /index.html 200` `_redirects` rule (it triggers “infinite loop” warnings and is unnecessary).
7. **Production vs staging:** Keep the Pages **Production branch = `main`** (`https://vettr.pages.dev`). Do **not** set production to `staging`. The git branch `staging` is intentional for a durable preview at `https://staging.vettr.pages.dev` (same `VITE_API_URL` / prod API Worker). Phone testing loop: [docs/guides/PHONE_TESTING.md](docs/guides/PHONE_TESTING.md).

---

## API CORS (Pages previews + staging)

Browser calls from Pages use credentials, so the API must **reflect** an allowed `Origin` (never `*`).

Allowlist lives in **`shared/corsAllow.js`** and is used by:

| Layer | Path | Role |
|--------|------|------|
| Express | `backend/src/index.js` | Primary CORS for tunnel origin |
| Worker | `workers/vettr-api-proxy` | Also injects ACAO for `https://vettr.pages.dev` and `https://*.vettr.pages.dev` (covers staging + PR previews even if Express is briefly stale) |

Allowed: prod Pages, staging, hash/named branch previews, configured `WEB_APP_URL` / localhost list, `chrome-extension://…`. Rejected: unrelated origins (e.g. `evil.com`).

**Deploy after CORS changes (required for cellular / preview):**

1. Merge/pull backend + Worker code on the Mac.
2. Restart API: `launchctl kickstart -k gui/$(id -u)/com.vettr.api`
3. Redeploy Worker (Pages does **not** deploy this):
   ```bash
   cd workers/vettr-api-proxy && wrangler deploy
   ```
   There is no GitHub Actions auto-deploy for the Worker on `main`; tunnel sync (`scripts/sync-tunnel-origin.sh`) also runs `wrangler deploy` when updating `TUNNEL_ORIGIN`.

Tests: `node shared/corsAllow.test.mjs`

## Backend — this Mac + Cloudflare tunnel

The Node API is **not** hosted on Koyeb. It runs on this machine:

1. LaunchAgent `com.vettr.api` → `scripts/start-vettr-api.sh` → `http://127.0.0.1:3001`
2. LaunchAgent `com.vettr.tunnel` → Cloudflare quick tunnel to `:3001`
3. Worker `workers/vettr-api-proxy` proxies public traffic; `scripts/sync-tunnel-origin.sh` updates `TUNNEL_ORIGIN` when the tunnel hostname rotates
4. Env: `backend/.env` (see [CONFIG.md](CONFIG.md)). Database is local Postgres.
5. After backend code changes: `launchctl kickstart -k gui/$(id -u)/com.vettr.api` — migrations run on API start
6. Verify: `GET http://localhost:3001/health` and `GET https://vettr-api.metzgerbuildsthings.workers.dev/health`

**Airtable scrape:** GitHub Actions [`.github/workflows/airtable-scrape-cron.yml`](.github/workflows/airtable-scrape-cron.yml) POSTs daily at 4:05 AM Pacific. GitHub secrets: `SCRAPE_TRIGGER_SECRET` (same as `backend/.env`) and `VETTR_API_BASE_URL` = `https://vettr-api.metzgerbuildsthings.workers.dev` (no trailing slash).

---

## CLI access for testing and troubleshooting

To inspect Cloudflare from the repo:

### Cloudflare (Wrangler)

1. **Install Wrangler** (one-time):
   ```bash
   npm install -g wrangler
   ```
2. **Create API token:** [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → use "Edit Cloudflare Workers" or custom token with **Account** → **Cloudflare Pages** → **Edit**.
3. **Get Account ID:** Dashboard → any product (e.g. Workers & Pages) → right sidebar "Account ID".
4. **Create `.env.cli`** in the project root (copy from `.env.cli.example`), set:
   - `CLOUDFLARE_ACCOUNT_ID` = your account ID  
   - `CLOUDFLARE_API_TOKEN` = your token  
   (`.env.cli` is gitignored.)
5. **Use in terminal:** Before running Wrangler, load the env:
   ```bash
   source .env.cli
   wrangler pages project list
   wrangler pages deployment list --project-name=vettr
   ```
   To set or check env vars for the frontend, use the dashboard (Workers & Pages → vettr → Settings → Environment variables) or the [Pages API](https://developers.cloudflare.com/api/operations/pages-project-list-projects).

Once Wrangler is set up, use it (with `source .env.cli`) to inspect Pages/Workers. Do not use the Koyeb CLI.

---

## Post-Deploy

### Update Frontend → Backend URL

In Cloudflare Pages → Settings → Environment Variables:

- Set `VITE_API_URL` to `https://vettr-api.metzgerbuildsthings.workers.dev/api`
- Trigger a new deployment only if that value changed (Vite bakes this into the build)

### Configure Stripe Webhook

1. Stripe Dashboard → Webhooks → Add Endpoint
2. URL: `https://vettr-api.metzgerbuildsthings.workers.dev/api/payments/webhook`
3. Copy the Webhook Signing Secret → set as `STRIPE_WEBHOOK_SECRET` in `backend/.env`

---

## Scaling Path

| Stage  | Monthly Cost | When to Upgrade                    |
|--------|--------------|------------------------------------|
| Free   | $0           | MVP / beta                         |
| Growth | ~$5–10/mo    | First revenue — e.g. Railway Hobby |
| Scale  | ~$40–65/mo   | Meaningful MRR — Vercel Pro + Neon |
