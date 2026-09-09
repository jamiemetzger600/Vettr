# Chrome Web Store — Vettr Extension (v5.0.29+)

## Before upload

1. **Build the store ZIP**
   ```bash
   chmod +x build-store-package.sh
   ./build-store-package.sh
   ```
   Output: `Vettr-Extension-v5.0.29-store.zip` (version from `version.js`)

2. **Host privacy policy** (required)  
   Live URL after Pages deploy:  
   `https://vettr.pages.dev/privacy-policy.html`  
   Enter that URL in the Developer Dashboard → Privacy practices.

3. **Production API / web** (baked into extension via `utils/vettr-config.js`)  
   - Web: `https://vettr.pages.dev`  
   - API: `https://vettr-api.metzgerbuildsthings.workers.dev/api`  
   Keep the iMac awake (tunnel + API) while Google reviews and while users sync.

4. **Extension ID (store):** `jbklcimaiblacheagjgioaodaehcdhki`  
   Cloudflare Pages production env (set):
   - `VITE_EXTENSION_ID=jbklcimaiblacheagjgioaodaehcdhki`
   - `VITE_CHROME_STORE_URL=https://chromewebstore.google.com/detail/jbklcimaiblacheagjgioaodaehcdhki`

## Listing copy (suggested)

| Field | Text |
|-------|------|
| **Name** | Find it. Vett it. Save it. |
| **Summary** | Aggregate acquisition deals, analyze with a scenario calculator, and sync saved deals with your Vettr account. |
| **Description** | Vettr helps business buyers find and evaluate acquisition opportunities. Aggregate deals from spreadsheets and sources you configure, filter with your buy box, run SBA-style scenario analysis on listing pages, and save deals to My Deals. Sign in once to sync saved deals with your Vettr account on the web. |
| **Category** | Productivity |
| **Language** | English |

## Screenshots to capture (1280×800 or 640×400)

1. Extension dashboard with **Sign in to sync My Deals** account bar visible.
2. Overlay calculator on a listing page with Save deal.
3. My Deals on https://vettr.pages.dev for the same signed-in user (bidirectional sync).

## Permission justifications (for review form)

| Permission | Why |
|------------|-----|
| `storage` / `unlimitedStorage` | Save deals, buy box, and calculator state locally |
| `activeTab` | Inject the deal analyzer on the current listing tab |
| `tabs` | Open/focus the Vettr dashboard; background refresh |
| `alarms` | Optional scheduled deal refresh |
| `notifications` | Optional new-deal alerts |
| `downloads` | Export deal backups |
| `identity` | Optional Google OAuth for private Google Sheets |
| `host_permissions` `https://*/*` | Read listing pages you visit; call Vettr API; fetch configured sheet URLs |

## Single purpose

**Help users find, analyze, and save business acquisition deals.**

## Test instructions for reviewers

1. Install from package (or load unpacked).
2. Click extension icon → dashboard opens.
3. Sign in with a test Vettr account (email/password) in the account bar.
4. Visit a business listing site → open calculator overlay → save a deal.
5. Confirm deal appears under My Deals on https://vettr.pages.dev when signed in as the same user.
6. Edit notes on the web → within about one minute they appear in the extension (or sooner if `VITE_EXTENSION_ID` is set).

## After publish

1. Extension ID: `jbklcimaiblacheagjgioaodaehcdhki` (already set on Cloudflare Pages).
2. `VITE_EXTENSION_ID` and `VITE_CHROME_STORE_URL` are on Pages production — redeploy after changing them.
3. Confirm Settings → Chrome extension shows **Install from Chrome Web Store**.
4. Local unpacked testing still uses the unpacked ID in `web/.env` (different from the store ID).
