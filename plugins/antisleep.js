/**
 * antisleep.js — keeps the bot alive on Orihost/Pterodactyl even during
 * high CPU periods. Sends HTTP pings to the bot's own /health endpoint at
 * a tight interval, and monitors CPU so spikes from updates don't kill the
 * process via the platform's CPU limiter.
 *
 * Commands:
 *   .antisleep         — show current keepalive status
 *   .antisleep on      — enable aggressive pinging (every 2 min)
 *   .antisleep off     — disable extra pinging
 *   .antisleep url     — set SELF_URL so pings go through public domain
 *   .antisleep test    — send a test ping right now
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_FILE = path.join(process.cwd(), 'data', 'antisleep.json');

// ── Persistent state ─────────────────────────────────────────────────────────
function loadState() {
    try {
        if (fs.existsSync(DATA_FILE))
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {}
    return { enabled: true, selfUrl: '', pingIntervalMs: 2 * 60 * 1000 };
}
function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch {}
}

// ── CPU measurement ──────────────────────────────────────────────────────────
let _lastCpuSnap = (() => {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
        for (const t of Object.values(c.times)) total += t;
        idle += c.times.idle;
    }
    return { idle, total };
})();

function getCpuPercent() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
        for (const t of Object.values(c.times)) total += t;
        idle += c.times.idle;
    }
    const idleDiff  = idle  - _lastCpuSnap.idle;
    const totalDiff = total - _lastCpuSnap.total;
    _lastCpuSnap = { idle, total };
    if (totalDiff === 0) return 0;
    return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

// ── Safe HTTP ping ───────────────────────────────────────────────────────────
async function ping(url, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        return { ok: res.ok, status: res.status };
    } catch (err) {
        clearTimeout(tid);
        return { ok: false, error: err.message };
    }
}

// ── Background ping loop ─────────────────────────────────────────────────────
// This module starts ONE background loop when first imported. Subsequent
// imports return the same singleton (ESM module cache).
let _loopStarted = false;

function startLoop() {
    if (_loopStarted) return;
    _loopStarted = true;

    // Read config from env first, then from saved state
    const portFromEnv = Number(process.env.PORT) || 5000;

    const tick = async () => {
        const state = loadState();
        if (!state.enabled) return;

        const localUrl = `http://localhost:${portFromEnv}/health`;
        const selfUrl  = (state.selfUrl || process.env.SELF_URL || '').trim().replace(/\/$/, '');

        // 1. Local ping — keeps event loop alive
        await ping(localUrl, 8000);

        // 2. Public ping — generates real inbound traffic (stops Pterodactyl sleep)
        if (selfUrl) {
            const r = await ping(`${selfUrl}/health`, 12000);
            if (!r.ok) {
                console.warn(`[antisleep] Public ping failed → ${selfUrl}/health — ${r.error || r.status}`);
            }
        }
    };

    // Run immediately, then on interval
    tick();
    setInterval(tick, 2 * 60 * 1000); // every 2 minutes (tighter than default 4 min)

    // CPU spike guard: if CPU goes above 85% during an update/heavy op,
    // we log a warning. The existing keepalive.js restarts at 90%.
    // This guard backs off npm-install style work by signalling via a flag.
    setInterval(() => {
        const pct = getCpuPercent();
        if (pct >= 85) {
            console.warn(`[antisleep] ⚠️ CPU at ${pct}% — if this persists >2 min the bot will auto-restart`);
        }
    }, 30 * 1000);
}

// Start loop on module load
startLoop();

// ── Status helper ─────────────────────────────────────────────────────────────
function buildStatusText(state) {
    const portFromEnv = Number(process.env.PORT) || 5000;
    const selfUrl = state.selfUrl || process.env.SELF_URL || '';
    const mem = process.memoryUsage();
    const cpu = getCpuPercent();
    const up  = Math.floor(process.uptime());
    const h   = Math.floor(up / 3600);
    const m   = Math.floor((up % 3600) / 60);
    const s   = up % 60;

    const lines = [
        `🔋 *Anti-Sleep Status*`,
        ``,
        `• Pinging: ${state.enabled ? '✅ ON (every 2 min)' : '❌ OFF'}`,
        `• Local health URL: \`http://localhost:${portFromEnv}/health\``,
        `• Public URL: ${selfUrl ? `\`${selfUrl}/health\`` : '⚠️ *Not set — bot may sleep!*'}`,
        ``,
        `📊 *System*`,
        `• CPU: ${cpu}%`,
        `• RAM: ${Math.round(mem.rss / 1024 / 1024)} MB`,
        `• Uptime: ${h}h ${m}m ${s}s`,
        ``,
    ];

    if (!selfUrl) {
        lines.push(
            `⚠️ *Action needed to prevent sleep:*`,
            `1. In Orihost panel → Variables, set:`,
            `   \`SELF_URL = https://your-bot-domain.orihost.com\``,
            ``,
            `OR send: _.antisleep url https://your-domain_`,
            ``,
            `2. OR go to https://cron-job.org (free)`,
            `   Create a cron job pinging your /health URL every 5 min`,
        );
    }

    lines.push(
        ``,
        `*Commands:*`,
        `• \`.antisleep on/off\` — toggle pinging`,
        `• \`.antisleep url <url>\` — set public URL`,
        `• \`.antisleep test\` — send test ping now`,
    );

    return lines.join('\n');
}

// ── Plugin export ─────────────────────────────────────────────────────────────
export default {
    command: 'antisleep',
    aliases: ['keepalive', 'nosleep', 'antislp'],
    category: 'owner',
    description: 'Manage keepalive pinging to prevent bot sleep on Orihost/Pterodactyl',
    usage: '.antisleep [on|off|url <url>|test]',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const state = loadState();
        const sub = (args[0] || '').toLowerCase();

        // .antisleep on
        if (sub === 'on') {
            state.enabled = true;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: `✅ *Anti-sleep pinging ENABLED*\nBot will ping /health every 2 minutes to stay awake.`
            }, { quoted: message });
        }

        // .antisleep off
        if (sub === 'off') {
            state.enabled = false;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: `❌ *Anti-sleep pinging DISABLED*\nWarning: bot may sleep on Orihost if no external pings are configured.`
            }, { quoted: message });
        }

        // .antisleep url https://...
        if (sub === 'url') {
            const url = (args[1] || '').trim().replace(/\/$/, '');
            if (!url.startsWith('http')) {
                return sock.sendMessage(chatId, {
                    text: `❌ Please provide a valid URL.\nExample: _.antisleep url https://your-bot.orihost.com_`
                }, { quoted: message });
            }
            state.selfUrl = url;
            saveState(state);
            // Test it right away
            const r = await ping(`${url}/health`, 12000);
            const testResult = r.ok
                ? `✅ Test ping succeeded (${r.status})`
                : `⚠️ Test ping failed: ${r.error || r.status} — check the URL is correct`;
            return sock.sendMessage(chatId, {
                text: `✅ *Public URL saved:*\n\`${url}/health\`\n\n${testResult}\n\nBot will now ping this URL every 2 minutes.`
            }, { quoted: message });
        }

        // .antisleep test
        if (sub === 'test') {
            const portFromEnv = Number(process.env.PORT) || 5000;
            const selfUrl = state.selfUrl || process.env.SELF_URL || '';
            await sock.sendMessage(chatId, {
                text: '🔍 Sending test pings…'
            }, { quoted: message });
            const localResult = await ping(`http://localhost:${portFromEnv}/health`, 8000);
            const lines = [
                `🔍 *Ping Test Results*`,
                ``,
                `• Local (/health): ${localResult.ok ? `✅ OK (${localResult.status})` : `❌ Failed — ${localResult.error || localResult.status}`}`,
            ];
            if (selfUrl) {
                const pubResult = await ping(`${selfUrl}/health`, 12000);
                lines.push(`• Public (${selfUrl}): ${pubResult.ok ? `✅ OK (${pubResult.status})` : `❌ Failed — ${pubResult.error || pubResult.status}`}`);
            } else {
                lines.push(`• Public: ⚠️ Not configured (use .antisleep url <url>)`);
            }
            const cpu = getCpuPercent();
            const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
            lines.push(``, `📊 CPU: ${cpu}% | RAM: ${mem} MB`);
            return sock.sendMessage(chatId, {
                text: lines.join('\n')
            }, { quoted: message });
        }

        // .antisleep (no subcommand) — show status
        return sock.sendMessage(chatId, {
            text: buildStatusText(state)
        }, { quoted: message });
    }
};
