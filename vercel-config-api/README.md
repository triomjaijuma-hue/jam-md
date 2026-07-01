# Airtel Config API (for JAM-MD `.jez` / `.airtel`)

Tiny Vercel API that replaces the dead Replit dev URL your bot was calling. Serves:

- `GET /api/jez` → JSON `{ count, sample[], protocols[], tags[], updated }` — GCP servers sorted first by default (fastest/most stable). Pass `?provider=gcp` to return GCP-only, or `?provider=other` for non-GCP.
- `GET /api/airtel` → downloadable `.mludp` config file — **GCP-only by default** (falls back to all configs if none are tagged GCP). Pass `?provider=all` to include every config.

## 1. Add your real configs

Edit `data/configs.json` and replace the placeholder `line` values with real
`vmess://`, `vless://`, `trojan://`, or `ss://` config strings. Each entry has
a `provider` field — set it to `"gcp"` for Google Cloud–hosted servers (these
are prioritized/filtered for speed and stability) or `"other"` for everything
else. Add as many entries as you want — both endpoints read from this same file.

## 2. Deploy to Vercel

**Option A — via GitHub (recommended, auto-redeploys on edits):**
1. Push this `vercel-config-api` folder to its own GitHub repo (or a
   subfolder of one).
2. Go to https://vercel.com/new, import that repo.
3. If it's a subfolder, set "Root Directory" to `vercel-config-api` during import.
4. Click Deploy. Vercel gives you a permanent `https://<project>.vercel.app` URL.

**Option B — via Vercel CLI (fastest, no GitHub needed):**
```
npm i -g vercel
cd vercel-config-api
vercel --prod
```
Follow the prompts; it prints your live `.vercel.app` URL at the end.

## 3. Point your bot at it (Railway)

Since your bot runs on Railway, set the variable there — not on Vercel:

1. Open your bot's project on https://railway.app.
2. Go to your service → **Variables** tab.
3. Add:
   ```
   AIRTEL_CONFIG_URL=https://<your-project>.vercel.app/api/airtel
   ```
4. Railway automatically redeploys the service when a variable changes. If it
   doesn't, trigger a manual redeploy from the Deployments tab.

Both `jez.js` and `airtel.js` in the bot derive their base URL from this one
variable, so you only need to set it once.
