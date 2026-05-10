/**
 * antisleep.js — keeps JAM-MD alive on Orihost/Pterodactyl.
 *
 * How sleep prevention works on Pterodactyl:
 *   - The bot CANNOT ping its own external IP from inside the container.
 *     (Pterodactyl doesn't support hairpin NAT — the container has no route
 *      back to itself through the host port mapping.)
 *   - What DOES work: local /health ping every 2 min keeps the Node.js
 *     event loop busy so the process never idles out.
 *   - For true "external traffic" keepalive, a FREE external cron service
 *     (cron-job.org) pings your public IP:port from outside. Setup is shown
 *     when you run .antisleep
 *
 * Commands:
 *   .antisleep          — show status + cron-job.org setup guide
 *   .antisleep on/off   — toggle local keepalive pinging
 *   .antisleep url <u>  — save your public URL (shown in status + cron guide)
 *   .antisleep test     — test local /health ping right now
 *   .antisleep cron     — show step-by-step cron-job.org setup
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_FILE = path.join(process.cwd(), 'data', 'antisleep.json');

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

// ── Local health ping (the only reliable ping from inside Pterodactyl) ────────
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

// ── Background keepalive loop (singleton) ─────────────────────────────────────
let _loopStarted = false;
function startLoop() {
    if (_loopStarted) return;
    _loopStarted = true;

    const port = Number(process.env.PORT) || 5000;

    const tick = async () => {
        const { enabled } = loadState();
        if (!enabled) return;
        // Local ping only — external pings always fail from inside Pterodactyl.
        // cron-job.org handles the external keepalive instead.
        await pingLocal(port);
    };

    tick();
    setInterval(tick, 2 * 60 * 1000); // every 2 minutes

    // CPU spike warning — complements the existing keepalive.js monitor
    setInterval(() => {
        const pct = getCpuPercent();
        if (pct >= 85)
            console.warn(`[antisleep] ⚠️ CPU ${pct}% — platform may throttle soon`);
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

    const lines = [
        `🔋 *Anti-Sleep Status*`,
        ``,
        `• Local ping: ${state.enabled ? '✅ ON (every 2 min)' : '❌ OFF'}`,
        `• Local URL:  \`http://localhost:${port}/health\``,
        `• Public URL: ${url ? `\`${url}\`` : '⚠️ Not set yet (see below)'}`,
        `• External keepalive: ${url ? '⚙️ Set up cron-job.org with your URL' : '❌ Not configured'}`,
        ``,
        `📊 *System*`,
        `• CPU: ${cpu}%`,
        `• RAM: ${Math.round(mem.rss / 1024 / 1024)} MB`,
        `• Uptime: ${h}h ${m}m ${s}s`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `⚠️ *Why external pings fail from inside Pterodactyl:*`,
        `Pterodactyl containers cannot reach their own external`,
        `IP — this is normal. Local pings work fine and keep`,
        `Node.js alive. For 24/7 uptime, use cron-job.org:`,
        ``,
        cronGuide(url),
        ``,
        `*Commands:*`,
        `• \`.antisleep on/off\` — toggle local pinging`,
        `• \`.antisleep url http://IP:PORT\` — save your public URL`,
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
    description: 'Keep bot alive on Orihost/Pterodactyl — local ping + cron-job.org guide',
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
                text: `✅ *Local keepalive ON*\nPinging /health every 2 min to keep Node.js alive.\n\nFor full 24/7 uptime, also set up cron-job.org:\n_.antisleep cron_`
            }, { quoted: message });
        }

        // ── .antisleep off ──
        if (sub === 'off') {
            state.enabled = false;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: `⏸️ *Local keepalive OFF*\nWarning: bot may idle out. Re-enable with _.antisleep on_`
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
                        `Example (use your Orihost IP and port):`,
                        `  _.antisleep url http://2.56.246.119:30003_`,
                        ``,
                        `You can find your IP:port in the Orihost panel → Address field.`,
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
                    `the Pterodactyl container — that is normal and expected.`,
                    ``,
                    `To use it for 24/7 keepalive, give this URL to cron-job.org:`,
                    ``,
                    cronGuide(url),
                ].join('\n')
            }, { quoted: message });
        }

        // ── .antisleep test ──
        if (sub === 'test') {
            const port   = Number(process.env.PORT) || 5000;
            const state2 = loadState();
            await sock.sendMessage(chatId, { text: '🔍 Testing local /health ping…' }, { quoted: message });
            const r   = await pingLocal(port);
            const cpu = getCpuPercent();
            const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
            return sock.sendMessage(chatId, {
                text: [
                    `🔍 *Ping Test*`,
                    ``,
                    `• Local /health: ${r.ok ? `✅ OK (${r.status})` : `❌ Failed — ${r.error || r.status}`}`,
                    `• External ping: ℹ️ Not tested from inside container`,
                    `  (use cron-job.org to ping from outside)`,
                    ``,
                    `📊 CPU: ${cpu}% | RAM: ${mem} MB`,
                    `🌐 Your public URL: ${state2.publicUrl || '(not set — use .antisleep url)'}`,
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
