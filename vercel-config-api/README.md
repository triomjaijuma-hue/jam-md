# Config API (for JAM-MD `.jez`)

Tiny Vercel API that replaces the dead Replit dev URL your bot was calling. Serves:

- `GET /api/jez` → JSON `{ count, sample[], protocols[], tags[], latencyMs[], updated, healthChecked, allOffline }` — every config is live TCP-checked and **ranked fastest first by latency**. GCP servers are prioritized within that ranking by default. Pass `?provider=gcp` to return GCP-only, or `?provider=other` for non-GCP.
- `GET /api/status` → JSON health report for every config: live TCP reachability check with `{ online, latencyMs, error }` per entry, plus overall `total`/`online`/`offline` counts.

> The `.airtel` command/endpoint has been removed — that VPN app required a
> separate signup step, so the bot now focuses entirely on `.jez`
> (`.airtel` still works as an *alias* for `.jez` in the bot, so old habits
> keep working).

## Live health checks & ranking

Every call to `/api/jez` does a live TCP connection test (≈1.5s timeout per
config, all checked in parallel) against each config's host/port before
responding — **only configs that answer right now are sent to the bot**, and
they're sorted by measured latency so the fastest server is always first. If
every config fails the check (e.g. all servers are actually down, or this
specific check is blocked on Vercel's network), it falls back to sending the
full list rather than leaving the bot with nothing.

`/api/status` runs the same check and returns a full report per config
(`online`, `latencyMs`, `error`) so you can monitor uptime without touching
the bot. Results are cached in memory for 60s per warm instance to avoid
hammering the same servers on rapid repeated polls — pass `?refresh=1` to
force a fresh check.

If you want continuous background monitoring (not just "checked when a user
runs `.jez`"), point a free external uptime pinger (e.g. cron-job.org,
UptimeRobot) at `https://<your-project>.vercel.app/api/status` every few
minutes. Vercel's own Cron Jobs feature works too, but the Hobby (free) plan
limits cron frequency to once per day — fine for a periodic log, but the
request-time checks in `/api/jez` already guarantee freshness where it
actually matters (what the bot sends users).

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
   AIRTEL_CONFIG_URL=https://<your-project>.vercel.app/api/jez
   ```
   (the variable name is kept as-is for backward compatibility — `plugins/jez.js`
   strips either `/api/jez` or the old `/api/airtel` suffix to find the base URL,
   so an already-set value pointing at `/api/airtel` still works fine too.)
4. Railway automatically redeploys the service when a variable changes. If it
   doesn't, trigger a manual redeploy from the Deployments tab.

`jez.js` in the bot derives its base URL from this one variable, so you only
need to set it once.
