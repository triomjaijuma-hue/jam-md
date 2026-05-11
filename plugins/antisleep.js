/**
 * antisleep.js — keeps JAM-MD alive on Orihost/Pterodactyl.
 *
 * Guards:
 *   - Local /health ping every 2 min (keeps Node.js event loop busy)
 *   - CPU guard: auto-restart via process.exit(1) if CPU >= 80% for 60s
 *   - Disk guard: auto-clean /tmp at 85%, warn owner at 80%, restart at 95%
 *   - cron-job.org pings public IP from outside every 5 min
 *
 * Commands:
 *   .antisleep          — show full status (CPU, RAM, disk, uptime)
 *   .antisleep on/off   — toggle local keepalive pinging
 *   .antisleep url <u>  — save public URL for cron-job.org guide
 *   .antisleep test     — test local /health ping + show system stats
 *   .antisleep cron     — show cron-job.org step-by-step setup
 *   .antisleep clean    — manually free tmp/session/media files right now
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const DATA_FILE = path.join(process.cwd(), 'data', 'antisleep.json');
const HOME      = process.env.HOME || '/home/container';

// ── Thresholds ────────────────────────────────────────────────────────────────
const CPU_WARN_PCT      = 80;
const CPU_CHECKS_LIMIT  = 2;   // consecutive 30-s checks before restart
const DISK_WARN_PCT     = 80;  // warn owner via console
const DISK_CLEAN_PCT    = 85;  // auto-clean tmp/media
const DISK_RESTART_PCT  = 95;  // restart to release any file handles

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

// ── Disk usage ────────────────────────────────────────────────────────────────
function getDiskUsage() {
    try {
        // Node 19+ has statfsSync; fall back to df if not available
        if (fs.statfsSync) {
            const s = fs.statfsSync(HOME);
            const total = s.blocks * s.bsize;
            const free  = s.bfree  * s.bsize;
            const used  = total - free;
            return {
                usedPct: Math.round((used / total) * 100),
                freeMB:  Math.round(free  / 1024 / 1024),
                totalMB: Math.round(total / 1024 / 1024),
            };
        }
    } catch {}
    try {
        const out = execSync(`df -k "${HOME}" 2>/dev/null | tail -1`).toString().trim().split(/\s+/);
        const total = parseInt(out[1]) * 1024;
        const used  = parseInt(out[2]) * 1024;
        const free  = parseInt(out[3]) * 1024;
        return {
            usedPct: Math.round((used / total) * 100),
            freeMB:  Math.round(free  / 1024 / 1024),
            totalMB: Math.round(total / 1024 / 1024),
        };
    } catch {}
    return null;
}

// ── Auto-clean routine ────────────────────────────────────────────────────────
function autoClean() {
    let freed = 0;
    const dirs = [
        path.join(HOME, 'tmp'),
        path.join(process.cwd(), 'tmp'),
        '/tmp',
    ];
    const mediaExts = ['.mp4', '.mp3', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ogg', '.opus'];

    for (const dir of dirs) {
        try {
            if (!fs.existsSync(dir)) continue;
            for (const f of fs.readdirSync(dir)) {
                const fp = path.join(dir, f);
                try {
                    const stat = fs.statSync(fp);
                    if (stat.isFile()) {
                        freed += stat.size;
                        fs.unlinkSync(fp);
                    }
                } catch {}
            }
        } catch {}
    }

    // Also remove stale media files from working directory
    try {
        for (const f of fs.readdirSync(process.cwd())) {
            if (mediaExts.includes(path.extname(f).toLowerCase())) {
                try {
                    const fp = path.join(process.cwd(), f);
                    freed += fs.statSync(fp).size;
                    fs.unlinkSync(fp);
                } catch {}
            }
        }
    } catch {}

    return Math.round(freed / 1024 / 1024); // MB freed
}

// ── Local health ping ─────────────────────────────────────────────────────────
async function pingLocal(port, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`http://localhost:${port}/health`, { signal: ctrl.signal });
        clearTimeout(tid);
        return { ok: res.ok, status: res.status };
    } catch (err) {
        clearTimeout(tid);
        return { ok: false, error: err.message };
    }
}

// ── Background loops (singleton) ──────────────────────────────────────────────
let _loopStarted = false;
function startLoop() {
    if (_loopStarted) return;
    _loopStarted = true;

    const port = Number(process.env.PORT) || 5000;
    let highCpuStreak   = 0;
    let diskWarnedOnce  = false;

    // ── Keepalive ping every 2 minutes ──────────────────────────────────────
    const ping = async () => {
        const { enabled } = loadState();
        if (enabled) await pingLocal(port);
    };
    ping();
    setInterval(ping, 2 * 60 * 1000);

    // ── CPU + Disk guard every 30 seconds ────────────────────────────────────
    setInterval(() => {
        // CPU check
        const cpu = getCpuPercent();
        if (cpu >= CPU_WARN_PCT) {
            highCpuStreak++;
            console.warn(`[antisleep] ⚠️ CPU ${cpu}% (${highCpuStreak}/${CPU_CHECKS_LIMIT})`);
            if (highCpuStreak >= CPU_CHECKS_LIMIT) {
                console.warn(`[antisleep] 🔄 CPU sustained ${cpu}% — restarting`);
                setTimeout(() => process.exit(1), 2000);
                return;
            }
        } else {
            if (highCpuStreak > 0) console.log(`[antisleep] ✅ CPU back to ${cpu}%`);
            highCpuStreak = 0;
        }

        // Disk check
        const disk = getDiskUsage();
        if (!disk) return;

        if (disk.usedPct >= DISK_RESTART_PCT) {
            console.warn(`[antisleep] 🚨 Disk ${disk.usedPct}% — restarting to release handles`);
            setTimeout(() => process.exit(1), 2000);
            return;
        }

        if (disk.usedPct >= DISK_CLEAN_PCT) {
            const freed = autoClean();
            console.warn(`[antisleep] 🧹 Disk ${disk.usedPct}% — auto-cleaned tmp/media, freed ~${freed} MB`);
            diskWarnedOnce = false;
            return;
        }

        if (disk.usedPct >= DISK_WARN_PCT && !diskWarnedOnce) {
            diskWarnedOnce = true;
            console.warn(`[antisleep] ⚠️ Disk ${disk.usedPct}% used — only ${disk.freeMB} MB free. Run .antisleep clean`);
        } else if (disk.usedPct < DISK_WARN_PCT) {
            diskWarnedOnce = false;
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
        `1️⃣  Go to → https://cron-job.org`,
        `2️⃣  Sign up free`,
        `3️⃣  Click *Create cronjob*`,
        `4️⃣  URL: \`${healthUrl}\``,
        `5️⃣  Schedule: *Every 5 minutes*`,
        `6️⃣  Save ✅`,
    ].join('\n');
}

function diskBar(pct) {
    const filled = Math.round(pct / 10);
    const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const icon   = pct >= DISK_RESTART_PCT ? '🚨' : pct >= DISK_CLEAN_PCT ? '🔴' : pct >= DISK_WARN_PCT ? '🟡' : '✅';
    return `${icon} ${bar} ${pct}%`;
}

function statusText(state) {
    const port = Number(process.env.PORT) || 5000;
    const mem  = process.memoryUsage();
    const cpu  = getCpuPercent();
    const up   = Math.floor(process.uptime());
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), s = up % 60;
    const disk = getDiskUsage();
    const url  = state.publicUrl || '';

    const cpuIcon = cpu >= CPU_WARN_PCT ? '⚠️' : cpu >= 70 ? '🟡' : '✅';

    const lines = [
        `🔋 *Anti-Sleep Status*`,
        ``,
        `• Keepalive: ${state.enabled ? '✅ ON (ping every 2 min)' : '❌ OFF'}`,
        `• CPU guard: ✅ restart if ≥${CPU_WARN_PCT}% for 60s`,
        `• Disk guard: ✅ clean at ${DISK_CLEAN_PCT}%, restart at ${DISK_RESTART_PCT}%`,
        ``,
        `📊 *System*`,
        `• CPU:    ${cpuIcon} ${cpu}%`,
        `• RAM:    ${Math.round(mem.rss / 1024 / 1024)} MB`,
        `• Disk:   ${disk ? diskBar(disk.usedPct) + ` (${disk.freeMB} MB free / ${disk.totalMB} MB)` : 'unavailable'}`,
        `• Uptime: ${h}h ${m}m ${s}s`,
        ``,
        `🌐 Public URL: ${url ? `\`${url}\`` : '⚠️ Not set'}`,
        ``,
        `*Commands:*`,
        `• \`.antisleep on/off\` — toggle pinging`,
        `• \`.antisleep url http://IP:PORT\` — set public URL`,
        `• \`.antisleep test\` — ping + system check`,
        `• \`.antisleep clean\` — free tmp/media files now`,
        `• \`.antisleep cron\` — external keepalive guide`,
    ];
    return lines.join('\n');
}

// ── Plugin export ─────────────────────────────────────────────────────────────
export default {
    command: 'antisleep',
    aliases: ['keepalive', 'nosleep', 'antislp'],
    category: 'owner',
    description: 'Keep bot alive — ping + CPU guard (80%) + disk guard (85%)',
    usage: '.antisleep [on|off|url <url>|test|clean|cron]',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const state = loadState();
        const sub   = (args[0] || '').toLowerCase();

        if (sub === 'on') {
            state.enabled = true;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: `✅ *Keepalive ON*\n• /health ping every 2 min\n• CPU auto-restart at ${CPU_WARN_PCT}%\n• Disk auto-clean at ${DISK_CLEAN_PCT}%`
            }, { quoted: message });
        }

        if (sub === 'off') {
            state.enabled = false;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: `⏸️ *Keepalive OFF*\n⚠️ CPU & disk guards still active.`
            }, { quoted: message });
        }

        if (sub === 'url') {
            const url = (args[1] || '').trim().replace(/\/$/, '');
            if (!url.startsWith('http')) {
                return sock.sendMessage(chatId, {
                    text: `❌ Provide full URL.\nExample: _.antisleep url http://2.56.246.119:30003_`
                }, { quoted: message });
            }
            state.publicUrl = url;
            saveState(state);
            return sock.sendMessage(chatId, {
                text: `✅ *URL saved:* \`${url}\`\n\n${cronGuide(url)}`
            }, { quoted: message });
        }

        if (sub === 'test') {
            const port = Number(process.env.PORT) || 5000;
            await sock.sendMessage(chatId, { text: '🔍 Running checks…' }, { quoted: message });
            const r    = await pingLocal(port);
            const cpu  = getCpuPercent();
            const disk = getDiskUsage();
            const mem  = Math.round(process.memoryUsage().rss / 1024 / 1024);
            return sock.sendMessage(chatId, {
                text: [
                    `🔍 *System Check*`,
                    ``,
                    `• /health ping: ${r.ok ? `✅ OK (${r.status})` : `❌ ${r.error || r.status}`}`,
                    `• CPU:  ${cpu >= CPU_WARN_PCT ? '⚠️' : '✅'} ${cpu}%`,
                    `• RAM:  ${mem} MB`,
                    `• Disk: ${disk ? diskBar(disk.usedPct) + ` — ${disk.freeMB} MB free` : 'unavailable'}`,
                ].join('\n')
            }, { quoted: message });
        }

        if (sub === 'clean') {
            await sock.sendMessage(chatId, { text: '🧹 Cleaning tmp/media files…' }, { quoted: message });
            const freed = autoClean();
            const disk  = getDiskUsage();
            return sock.sendMessage(chatId, {
                text: [
                    `🧹 *Cleanup Done*`,
                    `• Freed: ~${freed} MB`,
                    `• Disk now: ${disk ? diskBar(disk.usedPct) + ` (${disk.freeMB} MB free)` : 'unavailable'}`,
                ].join('\n')
            }, { quoted: message });
        }

        if (sub === 'cron') {
            return sock.sendMessage(chatId, {
                text: cronGuide(state.publicUrl)
            }, { quoted: message });
        }

        return sock.sendMessage(chatId, {
            text: statusText(state)
        }, { quoted: message });
    }
};
