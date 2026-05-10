/**
 * keepalive.js — prevents wispbyte/free-hosting from sleeping the bot
 *
 * Features:
 *  1. Self-ping  : hits /health every 4 min to keep the process alive
 *  2. Ext ping   : optionally pings PING_URL (UptimeRobot / cron-job.org) every 4 min
 *  3. Watchdog   : checks WA connection every 2 min; if stuck disconnected
 *                  for >5 min it fires forceRestart() so the bot recovers
 *                  even if the reconnect loop itself crashes
 *  4. CPU guard  : monitors CPU usage every 30 s; if sustained above CPU_LIMIT
 *                  (default 12%) it pauses heavy tasks and logs a warning.
 *                  Message processing checks cpuThrottled before running.
 */

import os from 'os';
import { printLog } from './print.js';

const SELF_PING_MS  = 4 * 60 * 1000;   // 4 minutes
const EXT_PING_MS   = 4 * 60 * 1000;   // 4 minutes
const WATCHDOG_MS   = 2 * 60 * 1000;   // check every 2 minutes
const STUCK_LIMIT   = 5 * 60 * 1000;   // treat as stuck after 5 min disconnected

// CPU governor settings
const CPU_CHECK_MS  = 30 * 1000;        // sample every 30 seconds
const CPU_LIMIT     = parseFloat(process.env.CPU_LIMIT || '12');   // % ceiling
const CPU_COOLDOWN  = 3;                // consecutive over-limit samples before throttling
const CPU_RECOVER   = 2;               // consecutive under-limit samples before unthrottling

let _disconnectedSince = null;          // null = currently connected

// ── CPU state (exported so message handlers can read it) ──────────────────
let _cpuThrottled = false;              // true while CPU is over the limit
let _overCount    = 0;                  // consecutive over-limit readings
let _underCount   = 0;                  // consecutive under-limit readings

/** Returns true when CPU usage is above the limit and tasks should be deferred */
export function isCpuThrottled() {
    return _cpuThrottled;
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
// Compares two os.cpus() snapshots to calculate % busy across all cores.
function cpuSnapshot() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
        for (const type of Object.keys(cpu.times)) {
            total += cpu.times[type];
        }
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

// ── CPU governor loop ──────────────────────────────────────────────────────
function startCpuGovernor() {
    setInterval(() => {
        const pct = measureCpuPercent();

        if (pct > CPU_LIMIT) {
            _underCount = 0;
            _overCount++;
            if (!_cpuThrottled && _overCount >= CPU_COOLDOWN) {
                _cpuThrottled = true;
                printLog('warning', `⚡ CPU throttle ON  — usage ${pct}% exceeds ${CPU_LIMIT}% limit`);
            } else if (_cpuThrottled) {
                printLog('warning', `⚡ CPU still high   — ${pct}% (throttle active)`);
            }
        } else {
            _overCount = 0;
            _underCount++;
            if (_cpuThrottled && _underCount >= CPU_RECOVER) {
                _cpuThrottled = false;
                printLog('info', `✅ CPU throttle OFF — usage back to ${pct}%`);
            }
        }
    }, CPU_CHECK_MS);

    printLog('info', `⚡ CPU governor started (limit ${CPU_LIMIT}%, checked every ${CPU_CHECK_MS / 1000}s)`);
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
    const selfUrl     = `http://localhost:${port}/health`;
    const externalUrl = (process.env.PING_URL || '').trim();

    // ── 1. Self-ping ────────────────────────────────────────────────────────
    setInterval(async () => {
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 10_000);
            await fetch(selfUrl, { signal: ctrl.signal });
            clearTimeout(tid);
            const up = Math.floor(process.uptime());
            const h  = Math.floor(up / 3600);
            const m  = Math.floor((up % 3600) / 60);
            const s  = up % 60;
            const connected  = !!getSocket()?.user;
            const cpuPct     = measureCpuPercent();
            const throttleTag = _cpuThrottled ? ' ⚡THROTTLED' : '';
            printLog(
                'info',
                `💓 Keep-alive OK | uptime ${h}h${m}m${s}s | WA: ${connected ? 'connected' : 'reconnecting'} | CPU: ${cpuPct}%${throttleTag}`
            );
        } catch {
            // If our own server doesn't respond — watchdog will handle it
        }
    }, SELF_PING_MS);

    // ── 2. External ping ──────────────────────────────────────────────────
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

    // ── 3. Watchdog ──────────────────────────────────────────────────────
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

    // ── 4. CPU governor ─────────────────────────────────────────────────
    startCpuGovernor();

    printLog('info', '💓 Keep-alive started (self-ping 4 min | watchdog 2 min | CPU governor 30 s)');
}
