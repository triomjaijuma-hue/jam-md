/**
 * keepalive.js — prevents wispbyte/free-hosting from sleeping the bot
 *
 * Features:
 *  1. Self-ping  : hits /health on localhost every 4 min (keeps process loop alive)
 *  2. Public ping : if SELF_URL is set, pings the bot's own public URL every 4 min
 *                   → this generates real inbound traffic that Wispbyte counts
 *  3. Ext ping   : optionally pings PING_URL (UptimeRobot / cron-job.org callback)
 *  4. Watchdog   : checks WA connection every 2 min; if stuck disconnected
 *                  for >5 min it fires forceRestart() so the bot recovers
 *  5. CPU monitor : logs CPU usage every 60 s; warns if above 75%, restarts if above 90%
 *
 * ─── HOW TO STOP WISPBYTE FROM SLEEPING ────────────────────────────────────
 *  Option A (recommended — easiest, free):
 *    1. Go to https://cron-job.org and create a free account
 *    2. Create a cron job: URL = https://YOUR-WISPBYTE-URL/health
 *       Interval = every 5 minutes
 *    3. Done — external pings prevent Wispbyte from sleeping
 *
 *  Option B (bot pings itself publicly):
 *    Set the environment variable SELF_URL=https://YOUR-WISPBYTE-URL
 *    on Wispbyte. The bot will then ping its own public /health endpoint
 *    every 4 minutes, generating inbound traffic Wispbyte sees as external.
 * ───────────────────────────────────────────────────────────────────────────
 */

import os from 'os';
import { printLog } from './print.js';

const SELF_PING_MS  = 4 * 60 * 1000;   // 4 minutes
const EXT_PING_MS   = 4 * 60 * 1000;   // 4 minutes
const WATCHDOG_MS   = 2 * 60 * 1000;   // check every 2 minutes
const STUCK_LIMIT   = 5 * 60 * 1000;   // treat as stuck after 5 min disconnected

// CPU monitor settings
// NOTE: A WhatsApp bot with 200+ plugins naturally uses 30-60% CPU on shared
// hosting like Wispbyte. The monitor only warns at 75%+ and force-restarts at
// 90%+ (to avoid platform kills). You can override via CPU_WARN / CPU_KILL env vars.
const CPU_CHECK_MS  = 60 * 1000;        // sample every 60 seconds
const CPU_WARN      = parseFloat(process.env.CPU_WARN || '75');   // % — log a warning
const CPU_KILL      = parseFloat(process.env.CPU_KILL || '90');   // % — force restart

let _disconnectedSince = null;

// isCpuThrottled kept for API compatibility — always returns false now
export function isCpuThrottled() {
    return false;
}

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

// ── CPU measurement ────────────────────────────────────────────────────────
function cpuSnapshot() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
        for (const type of Object.keys(cpu.times)) total += cpu.times[type];
        idle += cpu.times.idle;
    }
    return { idle, total };
}

let _lastSnapshot = cpuSnapshot();

function measureCpuPercent() {
    const now = cpuSnapshot();
    const idleDiff  = now.idle  - _lastSnapshot.idle;
    const totalDiff = now.total - _lastSnapshot.total;
    _lastSnapshot = now;
    if (totalDiff === 0) return 0;
    return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

function startCpuMonitor(forceRestart) {
    setInterval(() => {
        const pct = measureCpuPercent();
        if (pct >= CPU_KILL) {
            printLog('warning', `🔥 CPU critical — ${pct}% (limit ${CPU_KILL}%) — restarting to recover...`);
            try { forceRestart(); } catch { process.exit(1); }
        } else if (pct >= CPU_WARN) {
            printLog('warning', `⚠️  CPU high — ${pct}% (warn threshold ${CPU_WARN}%)`);
        } else {
            printLog('info', `📊 CPU OK — ${pct}%`);
        }
    }, CPU_CHECK_MS);

    printLog('info', `📊 CPU monitor started (warn >${CPU_WARN}% | restart >${CPU_KILL}% | every ${CPU_CHECK_MS / 1000}s)`);
}

// ── Safe fetch with timeout ────────────────────────────────────────────────
async function safeFetch(url, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        return res;
    } catch (err) {
        clearTimeout(tid);
        throw err;
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
    const localUrl    = `http://localhost:${port}/health`;
    const publicUrl   = (process.env.SELF_URL || '').trim().replace(/\/$/, '');
    const externalUrl = (process.env.PING_URL  || '').trim();

    // ── Startup guidance ────────────────────────────────────────────────────
    if (publicUrl) {
        printLog('info', `🌍 Public self-ping enabled → ${publicUrl}/health (every 4 min)`);
        printLog('info', `   ✅ This generates real inbound traffic — Wispbyte will NOT sleep`);
    } else {
        printLog('warning', `⚠️  SELF_URL not set — bot may sleep on Wispbyte!`);
        printLog('warning', `   Fix: set SELF_URL=https://your-wispbyte-url in env vars`);
        printLog('warning', `   OR:  go to https://cron-job.org and ping /health every 5 min`);
    }

    // ── 1. Local self-ping (keeps event loop busy) ──────────────────────────
    setInterval(async () => {
        try {
            await safeFetch(localUrl, 10_000);
            const up = Math.floor(process.uptime());
            const h  = Math.floor(up / 3600);
            const m  = Math.floor((up % 3600) / 60);
            const s  = up % 60;
            const connected = !!getSocket()?.user;
            printLog(
                'info',
                `💓 Keep-alive OK | uptime ${h}h${m}m${s}s | WA: ${connected ? 'connected' : 'reconnecting'}`
            );
        } catch {
            // local server not responding — watchdog will handle it
        }
    }, SELF_PING_MS);

    // ── 2. Public self-ping (SELF_URL) — generates inbound traffic ──────────
    // This is the key fix for Wispbyte: the bot hits its own public HTTPS URL,
    // which enters through Wispbyte's load balancer as real external traffic.
    if (publicUrl) {
        setInterval(async () => {
            try {
                const res = await safeFetch(`${publicUrl}/health`, 15_000);
                if (res.ok) {
                    printLog('info', `🌍 Public self-ping OK → ${publicUrl}/health`);
                } else {
                    printLog('warning', `⚠️  Public self-ping returned ${res.status}`);
                }
            } catch (err) {
                printLog('warning', `⚠️  Public self-ping failed → ${err.message}`);
            }
        }, SELF_PING_MS);
    }

    // ── 3. External ping (PING_URL — UptimeRobot / cron-job.org signal) ─────
    if (externalUrl) {
        setInterval(async () => {
            try {
                await safeFetch(externalUrl, 15_000);
                printLog('info', `🌐 External ping OK → ${externalUrl}`);
            } catch {
                printLog('warning', `⚠️  External ping failed → ${externalUrl}`);
            }
        }, EXT_PING_MS);
        printLog('info', `🌐 External keep-alive enabled → ${externalUrl} (every 4 min)`);
    }

    // ── 4. Watchdog ─────────────────────────────────────────────────────────
    setInterval(() => {
        const sock = getSocket();
        if (sock?.user) {
            markConnected();
            return;
        }
        if (_disconnectedSince !== null) {
            const stuckFor = Date.now() - _disconnectedSince;
            if (stuckFor >= STUCK_LIMIT) {
                const mins = Math.ceil(stuckFor / 60_000);
                printLog('warning', `🐕 Watchdog: disconnected ${mins}min — forcing restart to recover...`);
                _disconnectedSince = null;
                try { forceRestart(); } catch { process.exit(1); }
            }
        }
    }, WATCHDOG_MS);

    // ── 5. CPU monitor ─────────────────────────────────────────────────────
    startCpuMonitor(forceRestart);

    printLog('info', '💓 Keep-alive started (local 4 min | watchdog 2 min | CPU 30 s)');
}
