/**
 * antisleep.js — keeps JAM-MD alive on Orihost/Pterodactyl.
 *
 * How sleep prevention works on Pterodactyl:
 *   - The bot CANNOT ping its own external IP from inside the container.
 *     (Pterodactyl doesn't support hairpin NAT.)
 *   - Local /health ping every 2 min keeps the Node.js event loop busy.
 *   - cron-job.org pings the public IP from outside every 5 min.
 *   - If CPU hits 80% for 2 consecutive checks (60 s), bot auto-restarts
 *     via process.exit(1) — Pterodactyl brings it back automatically.
 *
 * Commands:
 *   .antisleep          — show status + cron-job.org setup guide
 *   .antisleep on/off   — toggle local keepalive pinging
 *   .antisleep url <u>  — save your public URL (shown in cron guide)
 *   .antisleep test     — test local /health ping right now
 *   .antisleep cron     — show step-by-step cron-job.org setup
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_FILE = path.join(process.cwd(), 'data', 'antisleep.json');

// ── CPU threshold ─────────────────────────────────────────────────────────────
const CPU_RESTART_THRESHOLD = 80;   // restart if CPU >= this
const CPU_CHECKS_BEFORE_RESTART = 2; // must be high for N consecutive 30-s checks

// ── Persistent state ──────────────────────────────────────────────────────────
function loadState() {
    try {
        if (fs.existsSync(DATA_FILE))
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {}
    return { enabled: true, publicUrl: '' };
}
function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch {}
}

// ── CPU measurement ───────────────────────────────────────────────────────────
let _lastCpuSnap = cpuSnap();
function cpuSnap() {
    let idle = 0, total = 0;
    for (const c of os.cpus()) {
        for (const t of Object.values(c.times)) total += t;
        idle += c.times.idle;
    }
    return { idle, total };
}
function getCpuPercent() {
    const now = cpuSnap();
    const idleDiff  = now.idle  - _lastCpuSnap.idle;
    const totalDiff = now.total - _lastCpuSnap.total;
    _lastCpuSnap = now;
    if (totalDiff === 0) return 0;
    return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

// ── Local health ping ─────────────────────────────────────────────────────────
async function pingLocal(port, timeoutMs = 8000) {
    const url = `http://localhost:${port}/health`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        return { ok: res.ok, status: res.status, url };
    } catch (err) {
        clearTimeout(tid);
        return { ok: false, error: err.message, url };
    }
}

// ── Background loops (singleton) ──────────────────────────────────────────────
let _loopStarted = false;
function startLoop() {
    if (_loopStarted) return;
    _loopStarted = true;

    const port = Number(process.env.PORT) || 5000;
    let highCpuStreak = 0; // consecutive high-CPU checks

    // ── Keepalive ping every 2 minutes ──
    const ping = async () => {
        const { enabled } = loadState();
        if (!enabled) return;
        await pingLocal(port);
    };
    ping();
    setInterval(ping, 2 * 60 * 1000);

    // ── CPU guard every 30 seconds ──
    setInterval(() => {
        const pct = getCpuPercent();

        if (pct >= CPU_RESTART_THRESHOLD) {
            highCpuStreak++;
            console.warn(
                `[antisleep] ⚠️ CPU ${pct}% — above ${CPU_RESTART_THRESHOLD}% ` +
                `(${highCpuStreak}/${CPU_CHECKS_BEFORE_RESTART} checks)`
            );

            if (highCpuStreak >= CPU_CHECKS_BEFORE_RESTART) {
                console.warn(
                    `[antisleep] 🔄 CPU sustained at ${pct}% for ` +
                    `${highCpuStreak * 30}s — triggering restart to clear load`
                );
                // Give Pterodactyl 2 s to log the message, then exit.
                // Exit code 1 → Pterodactyl auto-restarts the container.
                setTimeout(() => process.exit(1), 2000);
            }
        } else {
            if (highCpuStreak > 0) {
                console.log(`[antisleep] ✅ CPU back to ${pct}% — streak reset`);
            }
            highCpuStreak = 0;
        }
    }, 30 * 1000);
}
startLoop();

// ── Helpers ───────────────────────────────────────────────────────────────────
function cronGuide(publicUrl) {
    const healthUrl = publicUrl ? `${publicUrl}/health` : 'http://YOUR_IP:PORT/health';
    return [
        `📋 *cron-job.org Setup (free, 2 min)*`,
        ``,
        `This pings your bot from OUTSIDE every 5 min,`,
        `which is the only way to prevent Pterodactyl sleep.`,
        ``,
        `1️⃣  Go to → https://cron-job.org`,
        `2️⃣  Sign up free (no credit card)`,
        `3️⃣  Click *Create cronjob*`,
        `4️⃣  URL: \`${healthUrl}\``,
        `5️⃣  Execution schedule: *Every 5 minutes*`,
        `6️⃣  Save — done ✅`,
        ``,
        `Your bot will stay online 24/7.`,
    ].join('\n');
}

function statusText(state) {
    const port = Number(process.env.PORT) || 5000;
    const mem  = process.memoryUsage();
    const cpu  = getCpuPercent();
    const up   = Math.floor(process.uptime());
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), s = up % 60;
    const url  = state.publicUrl || '';

    const cpuStatus = cpu >= CPU_RESTART_THRESHOLD
        ? `⚠️ ${cpu}% (HIGH — will restart if sustained 60s)`
        : cpu >= 70
        ? `🟡 ${cpu}% (elevated)`
        : `✅ ${cpu}%`;

    const lines = [
        `🔋 *Anti-Sleep Status*`,
        ``,
        `• Local ping:    ${state.enabled ? '✅ ON (every 2 min)' : '❌ OFF'}`,
        `• CPU guard:     ✅ ON (restarts if ≥${CPU_RESTART_THRESHOLD}% for 60s)`,
        `• Public URL:    ${url ? `\`${url}\`` : '⚠️ Not set (see cron guide below)'}`,
        ``,
        `📊 *System*`,
        `• CPU:    ${cpuStatus}`,
        `• RAM:    ${Math.round(mem.rss / 1024 / 1024)} MB`,
        `• Uptime: ${h}h ${m}m ${s}s`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        cronGuide(url),
        ``,
        `*Commands:*`,
        `• \`.antisleep on/off\` — toggle local pinging`,
        `• \`.antisleep url http://IP:PORT\` — set public URL`,
        `• \`.antisleep test\` — test local /health ping`,
        `• \`.antisleep cron\` — show cron-job.org setup guide`,
    ];
    return lines.join('\n');
}

// ── Plugin export ─────────────────────────────────────────────────────────────
export default {
    command: 'antisleep',
    aliases: ['keepalive', 'nosleep', 'antislp'],
    category: 'owner',
    description: 'Keep bot alive on Orihost — ping + CPU guard (auto-restart at 80%)',
    usage: '.antisleep [on|off|url <url>|test|cron]',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const state = loadState();
        const sub   = (args[0] || '').toLowerCase();

        // ── .antisleep on ──
        if (sub === 'on') {
            state.enabled = true;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: [
                    `✅ *Local keepalive ON*`,
                    `• /health ping every 2 min`,
                    `• Auto-restart if CPU ≥ ${CPU_RESTART_THRESHOLD}% for 60s`,
                    ``,
                    `For full 24/7 uptime, set up cron-job.org:`,
                    `_.antisleep cron_`,
                ].join('\n')
            }, { quoted: message });
        }

        // ── .antisleep off ──
        if (sub === 'off') {
            state.enabled = false;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: `⏸️ *Local keepalive OFF*\n⚠️ CPU guard still active (auto-restart at ${CPU_RESTART_THRESHOLD}%).\nRe-enable pinging: _.antisleep on_`
            }, { quoted: message });
        }

        // ── .antisleep url <url> ──
        if (sub === 'url') {
            const url = (args[1] || '').trim().replace(/\/$/, '');
            if (!url.startsWith('http')) {
                return sock.sendMessage(chatId, {
                    text: [
                        `❌ Provide your full public URL.`,
                        ``,
                        `Example (your Orihost IP and port):`,
                        `  _.antisleep url http://2.56.246.119:30003_`,
                    ].join('\n')
                }, { quoted: message });
            }
            state.publicUrl = url;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: [
                    `✅ *Public URL saved:* \`${url}\``,
                    ``,
                    `📌 Note: the bot cannot ping this URL from inside`,
                    `the Pterodactyl container — that is normal.`,
                    `Give this URL to cron-job.org to ping from outside:`,
                    ``,
                    cronGuide(url),
                ].join('\n')
            }, { quoted: message });
        }

        // ── .antisleep test ──
        if (sub === 'test') {
            const port = Number(process.env.PORT) || 5000;
            await sock.sendMessage(chatId, { text: '🔍 Testing local /health ping…' }, { quoted: message });
            const r   = await pingLocal(port);
            const cpu = getCpuPercent();
            const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
            const cpuStatus = cpu >= CPU_RESTART_THRESHOLD
                ? `⚠️ ${cpu}% — HIGH (auto-restart will trigger if sustained)`
                : `${cpu}% — OK`;
            return sock.sendMessage(chatId, {
                text: [
                    `🔍 *Ping Test*`,
                    ``,
                    `• Local /health: ${r.ok ? `✅ OK (${r.status})` : `❌ Failed — ${r.error || r.status}`}`,
                    `• External ping: ℹ️ Done by cron-job.org (not testable from inside)`,
                    ``,
                    `📊 CPU: ${cpuStatus} | RAM: ${mem} MB`,
                ].join('\n')
            }, { quoted: message });
        }

        // ── .antisleep cron ──
        if (sub === 'cron') {
            return sock.sendMessage(chatId, {
                text: cronGuide(state.publicUrl)
            }, { quoted: message });
        }

        // ── .antisleep (status) ──
        return sock.sendMessage(chatId, {
            text: statusText(state)
        }, { quoted: message });
    }
};
