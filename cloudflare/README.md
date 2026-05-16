# Cloudflare Worker Proxy — Setup Guide

This folder contains the VLESS-over-WebSocket Cloudflare Worker that powers Airtel Uganda free internet configs in JAM-MD.

## Why Cloudflare?

Airtel Uganda allows traffic to Cloudflare IPs for free (because WhatsApp, Facebook, and many other zero-rated services use Cloudflare's CDN). By running your proxy on Cloudflare Workers, you get a server on those same IPs — no VPS needed, completely free.

## Step 1 — Create a Cloudflare account

Go to https://cloudflare.com and sign up for free.

## Step 2 — Deploy the Worker

**Option A — Cloudflare Dashboard (easiest, no terminal needed):**

1. Log in to https://dash.cloudflare.com
2. Click **Workers & Pages** → **Create application** → **Create Worker**
3. Name it `jam-md-proxy`
4. Click **Deploy**
5. Click **Edit code** and paste the entire contents of `worker.js` (this folder)
6. Click **Save and deploy**

**Option B — Wrangler CLI:**

```bash
npm install -g wrangler
wrangler login
cd cloudflare/
wrangler deploy
```

## Step 3 — Set your UUID

1. Generate a UUID at https://www.uuidgenerator.net/ — copy it
2. In the Cloudflare dashboard → **Workers & Pages** → `jam-md-proxy` → **Settings** → **Variables**
3. Add variable: `USER_ID` = your UUID
4. Click **Save and deploy**

## Step 4 — Get your Worker URL

Your worker URL will be: `jam-md-proxy.<your-cloudflare-subdomain>.workers.dev`

Find it in: Cloudflare dashboard → Workers & Pages → jam-md-proxy

## Step 5 — Configure the bot

Send this command to your bot (owner only):

```
.airtelsetup jam-md-proxy.yourname.workers.dev YOUR-UUID-HERE
```

That's it! Users can now run `.airtel` to get working Airtel Uganda configs.

## Troubleshooting

- **Connection refused** — Make sure the Worker is deployed and the URL is correct
- **Auth failed** — UUID in the bot must exactly match `USER_ID` in Cloudflare
- **Still no internet on Airtel** — Airtel Uganda may have changed their zero-rating. Try different bug hosts (they're all sent by `.airtel` automatically)
