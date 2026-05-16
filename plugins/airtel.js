import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch {}
    return null;
}

// Test if a WebSocket path on the Worker actually responds (not 404)
function testPath(workerUrl, wsPath) {
    return new Promise((resolve) => {
        const wsKey = Buffer.from(Math.random().toString()).toString('base64');
        const req = https.request({
            hostname: workerUrl,
            port: 443,
            path: wsPath,
            method: 'GET',
            timeout: 6000,
            headers: {
                'Host': workerUrl,
                'Upgrade': 'websocket',
                'Connection': 'Upgrade',
                'Sec-WebSocket-Key': wsKey,
                'Sec-WebSocket-Version': '13',
                'User-Agent': 'V2RayNG/1.8'
            }
        }, (res) => {
            // 101 = WebSocket upgrade (path is live)
            // 400 = bad request but server responded (path may still work)
            // 404 = path does not exist on this Worker
            const ok = res.statusCode === 101 || res.statusCode === 400;
            res.destroy();
            resolve(ok);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
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
        v: '2',
        ps: `Airtel-UG-${bugHost}`,
        add: workerUrl,
        port: '443',
        id: uuid,
        aid: '0',
        scy: 'auto',
        net: 'ws',
        type: 'none',
        host: bugHost,
        path: wsPath,
        tls: 'tls',
        sni: workerUrl,
        alpn: '',
        fp: ''
    };
    return 'vmess://' + Buffer.from(JSON.stringify(cfg)).toString('base64');
}

const BUG_HOSTS = [
    'web.whatsapp.com',
    'mmg.whatsapp.net',
    'airtel.co.ug',
    'selfcare.ug.airtel.com',
];

export default {
    command: 'airtel',
    aliases: ['airtelug'],
    category: 'tools',
    description: 'Generate real working V2Ray configs for Airtel Uganda free internet',
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
            text: `⏳ Testing your Cloudflare Worker paths...\n🌐 ${workerUrl}`
        }, { quoted: message });

        // Test all common paths + the user-configured one
        const pathsToTest = [...new Set([wsPath, `/${uuid}`, '/vless', '/', '/ws'])];

        const workingPaths = [];
        await Promise.all(pathsToTest.map(async (p) => {
            const ok = await testPath(workerUrl, p);
            if (ok) workingPaths.push(p);
        }));

        if (workingPaths.length === 0) {
            return sock.sendMessage(chatId, {
                text: [
                    '❌ None of the tested paths responded on your Worker.',
                    '',
                    `Worker: ${workerUrl}`,
                    `Tested: ${pathsToTest.join(', ')}`,
                    '',
                    'Make sure your Cloudflare Worker is deployed and the URL is correct.',
                    'Then re-run: .airtelsetup <worker-url> <uuid> [correct-path]'
                ].join('\n')
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: `✅ Found ${workingPaths.length} working path(s): ${workingPaths.join(', ')}\n\n📤 Sending configs — each link is a separate message for easy copying.`
        });

        // Use first working path
        const activePath = workingPaths[0];
        const allLinks = [];

        for (const bugHost of BUG_HOSTS) {
            const vless = makeVlessLink(workerUrl, uuid, bugHost, activePath);
            const vmess = makeVmessLink(workerUrl, uuid, bugHost, activePath);
            allLinks.push(vless, vmess);

            // Send header for this bug host
            await sock.sendMessage(chatId, {
                text: `🐛 *Bug host: ${bugHost}*\nPath: ${activePath}\nCopy the link below ↓`
            });

            // Send VLESS link as its own message — long-press copies only the link
            await sock.sendMessage(chatId, { text: vless });

            // Send VMess link as its own message
            await sock.sendMessage(chatId, { text: vmess });
        }

        // Send a subscription .txt file (base64 list) for V2RayNG bulk import
        try {
            const subContent = Buffer.from(allLinks.join('\n')).toString('base64');
            const tmpFile = path.join(os.tmpdir(), `airtel-sub-${Date.now()}.txt`);
            fs.writeFileSync(tmpFile, subContent);
            await sock.sendMessage(chatId, {
                document: fs.readFileSync(tmpFile),
                mimetype: 'text/plain',
                fileName: 'airtel-ug.txt',
                caption: `📋 *V2RayNG Subscription file*\nContains all ${allLinks.length} configs (${BUG_HOSTS.length} bug hosts, VLESS + VMess)\n\nV2RayNG → ☰ → Subscription group → ➕ → save file URL, or import manually.`
            });
            fs.unlinkSync(tmpFile);
        } catch {}

        await sock.sendMessage(chatId, {
            text: [
                '✅ *All configs sent!*',
                '',
                '*How to use in V2RayNG:*',
                '1. Long-press any link above → Copy',
                '2. Open V2RayNG → ➕ → Import config from clipboard',
                '3. Tap the config → ▶ Connect',
                '4. If one bug host fails, try the next'
            ].join('\n')
        }, { quoted: message });
    }
};
