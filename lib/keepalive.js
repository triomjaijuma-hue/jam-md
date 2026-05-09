/**
 * keepalive.js — prevents wispbyte/free-hosting from sleeping the bot
 *
 * Features:
 *  1. Self-ping  : hits /health every 4 min to keep the process alive
 *  2. Ext ping   : optionally pings PING_URL (UptimeRobot / cron-job.org) every 4 min
 *  3. Watchdog   : checks WA connection every 2 min; if stuck disconnected
 *                  for >5 min it fires forceRestart() so the bot recovers
 *                  even if the reconnect loop itself crashes
 */

import { printLog } from './print.js';

const SELF_PING_MS  = 4 * 60 * 1000;   // 4 minutes
const EXT_PING_MS   = 4 * 60 * 1000;   // 4 minutes
const WATCHDOG_MS   = 2 * 60 * 1000;   // check every 2 minutes
const STUCK_LIMIT   = 5 * 60 * 1000;   // treat as stuck after 5 min disconnected

let _disconnectedSince = null;   // null = currently connected

/** Call this when the WhatsApp 'open' event fires */
export function markConnected() {
    _disconnectedSince = null;
}

/** Call this when the WhatsApp 'close' event fires */
export function markDisconnected() {
    if (_disconnectedSince === null) {
        _disconnectedSince = Date.now();
    }
}

/**
 * Start all keep-alive mechanisms.
 *
 * @param {object} opts
 * @param {number}   opts.port          HTTP server port (for self-ping)
 * @param {()=>any}  opts.getSocket     Returns the current Baileys socket (or null)
 * @param {()=>void} opts.forceRestart  Called when watchdog decides the bot is stuck
 */
export function startKeepAlive({ port, getSocket, forceRestart }) {
    const selfUrl    = `http://localhost:${port}/health`;
    const externalUrl = (process.env.PING_URL || '').trim();

    // ── 1. Self-ping ────────────────────────────────────────────────────────
    setInterval(async () => {
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 10_000);
            const res  = await fetch(selfUrl, { signal: ctrl.signal });
            clearTimeout(tid);
            const up = Math.floor(process.uptime());
            const h  = Math.floor(up / 3600);
            const m  = Math.floor((up % 3600) / 60);
            const s  = up % 60;
            const connected = !!getSocket()?.user;
            printLog('info', `💓 Keep-alive OK | uptime ${h}h${m}m${s}s | WA: ${connected ? 'connected' : 'reconnecting'}`);
        } catch {
            // If our own server doesn't respond — watchdog will handle it
        }
    }, SELF_PING_MS);

    // ── 2. External ping ─────────────────────────────────────────────────────
    if (externalUrl) {
        setInterval(async () => {
            try {
                const ctrl = new AbortController();
                const tid  = setTimeout(() => ctrl.abort(), 15_000);
                await fetch(externalUrl, { signal: ctrl.signal });
                clearTimeout(tid);
                printLog('info', `🌐 External ping OK → ${externalUrl}`);
            } catch {
                printLog('warning', `⚠️  External ping failed → ${externalUrl}`);
            }
        }, EXT_PING_MS);
        printLog('info', `🌐 External keep-alive enabled → ${externalUrl} (every 4 min)`);
    }

    // ── 3. Watchdog ──────────────────────────────────────────────────────────
    setInterval(() => {
        const sock = getSocket();
        if (sock?.user) {
            // Connected — clear any stuck timer
            markConnected();
            return;
        }
        // Not connected — check how long we've been waiting
        if (_disconnectedSince !== null) {
            const stuckFor = Date.now() - _disconnectedSince;
            if (stuckFor >= STUCK_LIMIT) {
                const mins = Math.ceil(stuckFor / 60_000);
                printLog('warning', `🐕 Watchdog: disconnected ${mins}min — forcing restart to recover...`);
                _disconnectedSince = null; // reset so we don't loop
                try { forceRestart(); } catch { process.exit(1); }
            }
        }
    }, WATCHDOG_MS);

    printLog('info', '💓 Keep-alive started (self-ping 4 min | watchdog 2 min)');
}
