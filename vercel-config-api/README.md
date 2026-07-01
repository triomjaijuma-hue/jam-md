# Airtel Config API (for JAM-MD `.jez` / `.airtel`)

Tiny Vercel API that replaces the dead Replit dev URL your bot was calling. Serves:

- `GET /api/jez` → JSON `{ count, sample[], protocols[], tags[], updated, healthChecked, allOffline }` — GCP servers sorted first by default (fastest/most stable). Pass `?provider=gcp` to return GCP-only, or `?provider=other` for non-GCP.
- `GET /api/airtel` → downloadable `.mludp` config file — **GCP-only by default** (falls back to all configs if none are tagged GCP). Pass `?provider=all` to include every config.
- `GET /api/status` → JSON health report for every config: live TCP reachability check with `{ online, latencyMs, error }` per entry, plus overall `total`/`online`/`offline` counts.

## Live health checks

Every call to `/api/jez` and `/api/airtel` now does a live TCP connection test
(≈1.5s timeout per config, all checked in parallel) against each config's
host/port before responding — **only configs that answer right now are sent
to the bot.** If every config fails the check (e.g. all servers are actually
down, or this specific check is blocked on Vercel's network), it falls back
to sending the full list rather than leaving the bot with nothing.

`/api/status` runs the same check and returns a full report per config
(`online`, `latencyMs`, `error`) so you can monitor uptime without touching
the bot. Results are cached in memory for 60s per warm instance to avoid
hammering the same servers on rapid repeated polls — pass `?refresh=1` to
force a fresh check.

If you want continuous background monitoring (not just "checked when a user
runs `.jez`/`.airtel`"), point a free external uptime pinger (e.g.
cron-job.org, UptimeRobot) at `https://<your-project>.vercel.app/api/status`
every few minutes. Vercel's own Cron Jobs feature works too, but the Hobby
(free) plan limits cron frequency to once per day — fine for a periodic log,
but the request-time checks in `/api/jez` and `/api/airtel` already guarantee
freshness where it actually matters (what the bot sends users).

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
