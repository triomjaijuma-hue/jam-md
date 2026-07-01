# Airtel Config API (for JAM-MD `.jez` / `.airtel`)

Tiny Vercel API that replaces the dead Replit dev URL your bot was calling. Serves:

- `GET /api/jez` → JSON `{ count, sample[], protocols[], tags[], updated }`
- `GET /api/airtel` → downloadable `.mludp` config file

## 1. Add your real configs

Edit `data/configs.json` and replace the placeholder `line` values with real
`vmess://`, `vless://`, `trojan://`, or `ss://` config strings. Add as many
entries as you want — both endpoints read from this same file.

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

## 3. Point your bot at it

In your `jam-md` bot's environment variables, set:

```
AIRTEL_CONFIG_URL=https://<your-project>.vercel.app/api/airtel
```

Both `jez.js` and `airtel.js` in the bot derive their base URL from this one
variable, so you only need to set it once. Restart the bot after setting it.
