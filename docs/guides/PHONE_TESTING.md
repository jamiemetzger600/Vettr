# Phone testing away from home

Use Cloudflare Pages URLs on cellular (not home LAN Vite) so Jamie can exercise mobile work without being on the same Wi‑Fi as the Mac.

Staging and PR previews talk to the **same production API** Worker (`https://vettr-api.metzgerbuildsthings.workers.dev`). CORS on that Worker + Express allowlist must allow `https://*.vettr.pages.dev` (see `shared/corsAllow.js`).

## Loop

1. **Ship a URL**
   - Push mobile work to a **draft PR** → Cloudflare Pages builds a preview (`https://<hash-or-branch>.vettr.pages.dev`), **or**
   - Merge / fast-forward into the durable **`staging`** branch for a stable URL: **https://staging.vettr.pages.dev**
2. **Open on phone (cellular OK)** — staging or the PR’s `*.vettr.pages.dev` preview.
3. **Confirm version** in the nav bar matches the build you expect.
4. **Send bugs**; iterate on the PR. Merge to **`main`** only after Jamie OK.

## Staging branch

| Item | Value |
|------|--------|
| Git branch | `staging` (from `main`; not the production branch) |
| Pages URL | `https://staging.vettr.pages.dev` (Pages default alias for branch `staging`) |
| Production branch | Keep Cloudflare Pages **Production branch = `main`** → `https://vettr.pages.dev` |
| API | Same prod Worker; no separate staging API |

To test a mobile PR on the stable staging URL without merging to main:

```bash
git fetch origin
git checkout staging
git reset --hard origin/cursor/your-mobile-branch   # or merge that PR branch
git push --force-with-lease origin staging
```

Prefer leaving `staging` ≈ `main` when idle; fast-forward it to a mobile PR only when you want that build at the stable URL.

## After CORS / API changes land

Preview CORS is enforced by:

1. **Express** (`backend/src/index.js` via `shared/corsAllow.js`) — restart the Mac API after pull:
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.vettr.api
   curl -s http://localhost:3001/health   # expect API version with the CORS change
   ```
2. **Worker proxy** (`workers/vettr-api-proxy`) — **must be redeployed** (not auto-deployed by Pages). From the Mac (with Wrangler logged in):
   ```bash
   cd workers/vettr-api-proxy
   wrangler deploy
   ```
   Or let `scripts/sync-tunnel-origin.sh` run a deploy when the tunnel hostname rotates (it deploys the Worker from the local tree).

Quick CORS check (should reflect Origin, not `*`):

```bash
curl -sI -X OPTIONS "https://vettr-api.metzgerbuildsthings.workers.dev/health" \
  -H "Origin: https://staging.vettr.pages.dev" \
  -H "Access-Control-Request-Method: GET" \
  | grep -i access-control-allow-origin
# expect: access-control-allow-origin: https://staging.vettr.pages.dev
```

See also [DEPLOY.md](../../DEPLOY.md) for the full stack and CLI notes.
