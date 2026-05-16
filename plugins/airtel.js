import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE))
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {}
    return null;
}

// Full WebSocket handshake test over TLS — lazy import tls to avoid startup issues
function testWebSocket(workerUrl, wsPath) {
    return new Promise(async (resolve) => {
        let socket;
        const done = (result) => {
            try { if (socket && !socket.destroyed) socket.destroy(); } catch {}
            resolve(result);
        };
        const timeout = setTimeout(() => done({ ok: false, latencyMs: -1, status: 'timeout' }), 8000);

        try {
            const tls = await import('tls');
            const start = Date.now();
            socket = tls.connect(
                { host: workerUrl, port: 443, servername: workerUrl, rejectUnauthorized: false },
                () => {
                    try {
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
                    } catch (e) {
                        clearTimeout(timeout);
                        done({ ok: false, latencyMs: -1, status: 'write-error' });
                    }
                }
            );
            let buf = '';
            socket.on('data', (chunk) => {
                buf += chunk.toString('binary');
                if (!buf.includes('\r\n\r\n')) return;
                const statusLine = buf.split('\r\n')[0];
                clearTimeout(timeout);
                done({ ok: statusLine.includes('101'), latencyMs: Date.now() - start, status: statusLine.trim() });
            });
            socket.on('error', () => { clearTimeout(timeout); done({ ok: false, latencyMs: -1, status: 'error' }); });
            socket.on('timeout', () => { clearTimeout(timeout); done({ ok: false, latencyMs: -1, status: 'timeout' }); });
        } catch (e) {
            clearTimeout(timeout);
            done({ ok: false, latencyMs: -1, status: e.message });
        }
    });
}

function makeVlessLink(workerUrl, uuid, bugHost, wsPath) {
    return (
        `vless://${uuid}@${workerUrl}:443` +
        `?encryption=none&security=tls&sni=${workerUrl}` +
        `&type=ws&host=${bugHost}&path=${encodeURIComponent(wsPath)}` +
        `#Airtel-UG-${bugHost}`
    );
}

function makeVmessLink(workerUrl, uuid, bugHost, wsPath) {
    const cfg = {
        v: '2', ps: `Airtel-UG-${bugHost}`,
        add: workerUrl, port: '443', id: uuid, aid: '0', scy: 'auto',
        net: 'ws', type: 'none', host: bugHost, path: wsPath,
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
            text: `🔍 Testing your Cloudflare Worker paths...\n🌐 ${workerUrl}\n\nRunning WebSocket handshake — takes ~8s`
        }, { quoted: message });

        const candidates = [...new Set([wsPath, `/${uuid}`, '/vless', '/', '/ws'])];

        let results;
        try {
            results = await Promise.all(
                candidates.map(async (p) => ({ path: p, ...(await testWebSocket(workerUrl, p)) }))
            );
        } catch (e) {
            return sock.sendMessage(chatId, {
                text: `❌ Test failed: ${e.message}\nCheck your internet connection and try again.`
            }, { quoted: message });
        }

        results.sort((a, b) => {
            if (a.ok && !b.ok) return -1;
            if (!a.ok && b.ok) return 1;
            return a.latencyMs - b.latencyMs;
        });

        const working = results.filter(r => r.ok);

        let report = `📊 *Worker Test Results*\n🌐 ${workerUrl}\n\n`;
        for (const r of results) {
            report += `${r.ok ? '✅' : '❌'} ${r.path.padEnd(30)} ${latencyBar(r.latencyMs)}\n`;
        }

        if (working.length === 0) {
            report += '\n❌ No working paths found.\nCheck your Worker is deployed and re-run:\n.airtelsetup <url> <uuid> <path>';
            return sock.sendMessage(chatId, { text: report }, { quoted: message });
        }

        report += `\n✅ Using fastest: *${working[0].path}* (${working[0].latencyMs}ms)`;
        await sock.sendMessage(chatId, { text: report });

        const bestPath = working[0].path;
        const allLinks = [];

        await sock.sendMessage(chatId, {
            text: `📤 Generating configs for ${BUG_HOSTS.length} bug hosts...\nLong-press each link to copy`
        });

        for (const bugHost of BUG_HOSTS) {
            const vless = makeVlessLink(workerUrl, uuid, bugHost, bestPath);
            const vmess = makeVmessLink(workerUrl, uuid, bugHost, bestPath);
            allLinks.push(vless, vmess);

            await sock.sendMessage(chatId, {
                text: `━━━━━━━━━━━━━━━━━━\n🐛 *${bugHost}*\n📁 Path: ${bestPath} | ⚡ ${working[0].latencyMs}ms\n━━━━━━━━━━━━━━━━━━\nVLESS ↓`
            });
            await sock.sendMessage(chatId, { text: vless });
            await sock.sendMessage(chatId, { text: 'VMess ↓' });
            await sock.sendMessage(chatId, { text: vmess });
        }

        // Subscription file
        try {
            const subContent = Buffer.from(allLinks.join('\n')).toString('base64');
            const tmpFile = path.join(os.tmpdir(), `airtel-ug-${Date.now()}.txt`);
            fs.writeFileSync(tmpFile, subContent);
            await sock.sendMessage(chatId, {
                document: fs.readFileSync(tmpFile),
                mimetype: 'text/plain',
                fileName: 'airtel-ug.txt',
                caption: `📋 *V2RayNG Subscription File*\n✅ Confirmed path: ${bestPath}\n📡 ${BUG_HOSTS.length} bug hosts × VLESS + VMess = ${allLinks.length} configs`
            });
            fs.unlinkSync(tmpFile);
        } catch {}

        await sock.sendMessage(chatId, {
            text: [
                '✅ *Done!*',
                '',
                '*V2RayNG steps:*',
                '1. Long-press a link above → Copy',
                '2. Open V2RayNG → ➕ → Import from clipboard',
                '3. Tap config → ▶ Connect',
                '4. Try each bug host until one gives internet'
            ].join('\n')
        }, { quoted: message });
    }
};
