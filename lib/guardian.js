// ═══════════════════════════════════════════════════════════════════════════
// lib/guardian.js — JAM-MD Security & Resilience Module
// Keeps the bot online 24/7 on Wispbyte with no env vars needed.
//
// Features:
//   • Circuit breaker   — exponential backoff prevents restart storms
//   • Rate limiter      — blocks IP flooding / DDoS on the HTTP server
//   • Memory watchdog   — proactive GC and leak detection
//   • Anti-crash guard  — wraps startJamBot with retry + backoff
// ═══════════════════════════════════════════════════════════════════════════

// ── Circuit breaker ───────────────────────────────────────────────────────────
// Tracks how many times the bot has restarted recently.
// If it crashes repeatedly, each retry waits longer (exponential backoff)
// so Wispbyte is not hammered and the session has time to stabilise.
const _restartHistory = [];
const WINDOW_MS = 5 * 60 * 1000; // 5-minute sliding window

export function getBackoffDelay() {
    const now = Date.now();
    while (_restartHistory.length && _restartHistory[0] < now - WINDOW_MS) {
        _restartHistory.shift(); // drop entries outside window
    }
    const count = _restartHistory.length;
    if (count === 0) return 2000;           //  1st restart  :  2 s
    if (count === 1) return 5000;           //  2nd           :  5 s
    if (count === 2) return 15000;          //  3rd           : 15 s
    if (count === 3) return 30000;          //  4th           : 30 s
    if (count === 4) return 60000;          //  5th           :  1 min
    return 2 * 60 * 1000;                  //  6th+          :  2 min (max)
}

export function recordRestart() {
    _restartHistory.push(Date.now());
}

// ── Rate limiter (blocks HTTP flood / DDoS) ───────────────────────────────────
// Tracks requests per IP in a sliding window.
// Any IP sending more than RL_MAX_REQ requests per minute is blocked (HTTP 429).
const _ipMap = new Map();
const RL_WINDOW_MS = 60 * 1000; // 1-minute window
const RL_MAX_REQ   = 120;        // generous limit — only blocks actual abuse

export function rateLimitMiddleware(req, res, next) {
    const ip =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown';

    const now = Date.now();
    let entry = _ipMap.get(ip);

    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + RL_WINDOW_MS };
    }
    entry.count++;
    _ipMap.set(ip, entry);

    // Prune stale entries so the Map never grows unbounded
    if (_ipMap.size > 2000) {
        for (const [k, v] of _ipMap) {
            if (now > v.resetAt) _ipMap.delete(k);
        }
    }

    if (entry.count > RL_MAX_REQ) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Too many requests — slow down.' });
    }
    next();
}

// ── Crash guard: wraps bot startup with circuit breaker ───────────────────────
// Returns a version of startFn that automatically retries on failure,
// using exponential backoff so repeated crashes do not cause a tight loop.
//
// Usage in index.js:
//   import { createCrashGuard } from './lib/guardian.js';
//   const safeStart = createCrashGuard(startJamBot, { log: printLog });
//   safeStart();
export function createCrashGuard(startFn, { log, logErr } = {}) {
    const _log = (level, msg) => { try { (log || console.error)(level, msg); } catch {} };
    const _logErr = (obj)     => { try { (logErr || (() => {}))(obj); } catch {} };

    async function attempt() {
        const delay = getBackoffDelay();
        if (delay > 3000) {
            _log('warning', '[guardian] ' + _restartHistory.length + ' restarts in 5 min — backing off ' + (delay / 1000) + 's');
        }
        recordRestart();
        await new Promise(r => setTimeout(r, delay));
        try {
            return await startFn();
        } catch (err) {
            _log('error', '[guardian] Bot crashed: ' + err.message);
            _logErr({ type: 'guardedCrash', error: err.message, stack: err.stack, timestamp: new Date().toISOString() });
            return attempt(); // retry with next backoff level
        }
    }
    return attempt;
}

// ── Memory watchdog ───────────────────────────────────────────────────────────
// Runs every 60 s. Logs a warning when RAM is high, exits when critical
// so the platform (Wispbyte/Railway/Render) restarts the container.
let _memWatchdogStarted = false;

export function startMemoryWatchdog({ warnMB = 600, exitMB = 900, log } = {}) {
    if (_memWatchdogStarted) return;
    _memWatchdogStarted = true;

    const _log = (level, msg) => { try { (log || console.error)(level, msg); } catch {} };

    setInterval(() => {
        // Proactive GC if the --expose-gc Node.js flag is set
        if (global.gc) { try { global.gc(); } catch {} }

        const usedMB = process.memoryUsage().rss / 1024 / 1024;
        if (usedMB > exitMB) {
            _log('warning', '[guardian] RAM critical (' + usedMB.toFixed(0) + ' MB) — restarting process to recover');
            process.exit(1); // platform restart policy brings it back
        } else if (usedMB > warnMB) {
            _log('warning', '[guardian] RAM high: ' + usedMB.toFixed(0) + ' MB / ' + exitMB + ' MB limit');
        }
    }, 60 * 1000);
}

export default { getBackoffDelay, recordRestart, rateLimitMiddleware, createCrashGuard, startMemoryWatchdog };
