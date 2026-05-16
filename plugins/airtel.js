import fs from 'fs';
import path from 'path';
import os from 'os';
import tls from 'tls';

const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch {}
    return null;
}

// Full WebSocket handshake test over TLS — confirms the path is truly live
// Returns { ok, latencyMs, status }
function testWebSocket(workerUrl, wsPath) {
    return new Promise((resolve) => {
        const start = Date.now();
        let settled = false;
        const done = (result) => {
            if (!settled) { settled = true; resolve(result); }
        };

        let socket;
        try {
            socket = tls.connect(
                { host: workerUrl, port: 443, servername: workerUrl },
                () => {
                    const key = Buffer.from(Math.random().toString(36)).toString('base64');
                    socket.write(
                        `GET ${wsPath} HTTP/1.1\r\n` +
                        `Host: ${workerUrl}\r\n` +
                        `Upgrade: websocket\r\n` +
                        `Connection: Upgrade\r\n` +
                        `Sec-WebSocket-Key: ${key}\r\n` +
                        `Sec-WebSocket-Version: 13\r\n` +
                        `User-Agent: V2RayNG/1.8.19\r\n\r\n`
                    );
                }
            );
        } catch {
            return done({ ok: false, latencyMs: -1, status: 'connect-error' });
        }

        let buf = '';
        socket.setTimeout(7000);
        socket.on('data', (chunk) => {
            buf += chunk.toString('binary');
            if (!buf.includes('\r\n\r\n')) return;
            const statusLine = buf.split('\r\n')[0];
            const latencyMs = Date.now() - start;
            const ok = statusLine.includes('101');
            socket.destroy();
            done({ ok, latencyMs, status: statusLine.trim() });
        });
        socket.on('timeout', () => { socket.destroy(); done({ ok: false, latencyMs: -1, status: 'timeout' }); });
        socket.on('error', () => done({ ok: false, latencyMs: -1, status: 'error' }));
    });
}

function makeVlessLink(workerUrl, uuid, bugHost, wsPath) {
    return (
        `vless://${uuid}@${workerUrl}:443` +
        `?encryption=none` +
        `&security=tls` +
        `&sni=${workerUrl}` +
        `&type=ws` +
        `&host=${bugHost}` +
        `&path=${encodeURIComponent(wsPath)}` +
        `#Airtel-UG-${bugHost}`
    );
}

function makeVmessLink(workerUrl, uuid, bugHost, wsPath) {
    const cfg = {
        v: '2', ps: `Airtel-UG-${bugHost}`,
        add: workerUrl, port: '443',
        id: uuid, aid: '0', scy: 'auto',
        net: 'ws', type: 'none',
        host: bugHost, path: wsPath,
        tls: 'tls', sni: workerUrl, alpn: '', fp: ''
    };
    return 'vmess://' + Buffer.from(JSON.stringify(cfg)).toString('base64');
}

function latencyBar(ms) {
    if (ms < 0) return '💀 dead';
    if (ms < 200) return `🟢 ${ms}ms`;
    if (ms < 500) return `🟡 ${ms}ms`;
    return `🔴 ${ms}ms`;
}

const BUG_HOSTS = [
    'web.whatsapp.com',
    'mmg.whatsapp.net',
    'airtel.co.ug',
    'selfcare.ug.airtel.com',
    'media.whatsapp.net',
];

export default {
    command: 'airtel',
    aliases: ['airtelug'],
    category: 'tools',
    description: 'Generate & test real working V2Ray configs for Airtel Uganda free internet',
    usage: '.airtel',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const config = getConfig();

        if (!config) {
            return sock.sendMessage(chatId, {
                text: '❌ Not configured yet.\nOwner must run:\n.airtelsetup <worker-url> <uuid> [ws-path]'
            }, { quoted: message });
        }

        const { workerUrl, uuid, wsPath } = config;

        await sock.sendMessage(chatId, {
            text: `🔍 Testing your Cloudflare Worker...\n🌐 ${workerUrl}\n\nRunning real WebSocket handshake on all paths — this takes ~7s`
        }, { quoted: message });

        // Test all candidate paths in parallel with real WS handshakes
        const candidates = [...new Set([wsPath, `/${uuid}`, '/vless', '/', '/ws'])];
        const results = await Promise.all(
            candidates.map(async (p) => ({ path: p, ...(await testWebSocket(workerUrl, p)) }))
        );

        // Sort: working first, then by latency
        results.sort((a, b) => {
            if (a.ok && !b.ok) return -1;
            if (!a.ok && b.ok) return 1;
            return a.latencyMs - b.latencyMs;
        });

        const working = results.filter(r => r.ok);
        const dead = results.filter(r => !r.ok);

        // Report test results
        let report = `📊 *Worker Test Results*\n🌐 ${workerUrl}\n\n`;
        for (const r of results) {
            report += `${r.ok ? '✅' : '❌'} ${r.path.padEnd(30)} ${latencyBar(r.latencyMs)}\n`;
        }
        if (working.length === 0) {
            report += '\n❌ No working paths found.\nCheck your Worker is deployed correctly.\nRe-run: .airtelsetup <url> <uuid> <path>';
            return sock.sendMessage(chatId, { text: report }, { quoted: message });
        }
        report += `\n✅ ${working.length} working — using fastest: *${working[0].path}* (${working[0].latencyMs}ms)`;
        await sock.sendMessage(chatId, { text: report });

        // Use the fastest confirmed path
        const bestPath = working[0].path;
        const allLinks = [];

        await sock.sendMessage(chatId, {
            text: `📤 Generating configs for ${BUG_HOSTS.length} bug hosts...\nEach link is a separate message — long-press to copy`
        });

        for (const bugHost of BUG_HOSTS) {
            const vless = makeVlessLink(workerUrl, uuid, bugHost, bestPath);
            const vmess = makeVmessLink(workerUrl, uuid, bugHost, bestPath);
            allLinks.push(vless, vmess);

            // Label message
            await sock.sendMessage(chatId, {
                text: `━━━━━━━━━━━━━━━━━━\n🐛 *${bugHost}*\n📁 Path: ${bestPath}\n⚡ Latency: ${working[0].latencyMs}ms\n━━━━━━━━━━━━━━━━━━\n👆 VLESS ↓`
            });
            // VLESS — standalone message, long-press copies only the link
            await sock.sendMessage(chatId, { text: vless });

            await sock.sendMessage(chatId, { text: '👆 VMess ↓' });
            // VMess — standalone message
            await sock.sendMessage(chatId, { text: vmess });
        }

        // Subscription file (base64 list) for V2RayNG bulk import
        try {
            const subContent = Buffer.from(allLinks.join('\n')).toString('base64');
            const tmpFile = path.join(os.tmpdir(), `airtel-ug-${Date.now()}.txt`);
            fs.writeFileSync(tmpFile, subContent);
            await sock.sendMessage(chatId, {
                document: fs.readFileSync(tmpFile),
                mimetype: 'text/plain',
                fileName: 'airtel-ug.txt',
                caption: [
                    `📋 *V2RayNG Subscription File*`,
                    `✅ Path tested & confirmed: ${bestPath}`,
                    `📡 ${BUG_HOSTS.length} bug hosts × VLESS + VMess = ${allLinks.length} configs`,
                    `⚡ Worker latency: ${working[0].latencyMs}ms`,
                    ``,
                    `*How to import:*`,
                    `V2RayNG → ☰ → Subscription group → ➕ → add URL`,
                    `Or: ➕ → Import config from clipboard (paste one link at a time)`
                ].join('\n')
            });
            fs.unlinkSync(tmpFile);
        } catch {}

        await sock.sendMessage(chatId, {
            text: [
                '✅ *Done! All configs use your fastest confirmed path.*',
                '',
                '*Steps in V2RayNG:*',
                '1. Long-press a link above → Copy',
                '2. Open V2RayNG → ➕ → Import config from clipboard',
                '3. Tap the config → ▶ Connect',
                '4. Try each bug host until one gives internet'
            ].join('\n')
        }, { quoted: message });
    }
};
