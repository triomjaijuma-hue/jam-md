import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch {}
    return null;
}

// Build a VLESS URI with correct percent-encoding for the path value
function makeVlessLink(workerUrl, uuid, bugHost, wsPath) {
    const encodedPath = encodeURIComponent(wsPath); // /vless → %2Fvless, etc.
    return (
        `vless://${uuid}@${workerUrl}:443` +
        `?encryption=none` +
        `&security=tls` +
        `&sni=${workerUrl}` +
        `&type=ws` +
        `&host=${bugHost}` +
        `&path=${encodedPath}` +
        `#Airtel-UG-${bugHost}`
    );
}

// Build a VMess URI (more universally supported by older V2Ray clients)
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
    description: 'Generate Airtel Uganda free internet configs for V2RayNG',
    usage: '.airtel',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const config = getConfig();

        if (!config) {
            return sock.sendMessage(chatId, {
                text: '❌ Not configured yet.\nOwner must run:\n*.airtelsetup <worker-url> <uuid> [ws-path]*\n\nExample:\n.airtelsetup myworker.workers.dev 1c0aed11-xxxx /vless'
            }, { quoted: message });
        }

        const { workerUrl, uuid, wsPath } = config;

        // Many Cloudflare Worker templates use different paths.
        // Try all common ones plus the user-configured one.
        const pathsToTry = [...new Set([
            wsPath,          // user-configured (top priority)
            `/${uuid}`,      // edtunnel style
            '/vless',        // generic
            '/',             // simple proxy
            '/ws',           // websocket path
        ])];

        await sock.sendMessage(chatId, {
            text: `⏳ Generating configs...\n🌐 Worker: ${workerUrl}\n🔑 UUID: ${uuid.slice(0, 8)}...`
        }, { quoted: message });

        // Send one message per bug host with all path variants
        for (const bugHost of BUG_HOSTS) {
            let msg = `🇺🇬 *Airtel Uganda — Bug: ${bugHost}*\n\nCopy any link below → V2RayNG → ➕ → Import from clipboard\nTry each path until one connects:\n`;

            for (const p of pathsToTry) {
                const vless = makeVlessLink(workerUrl, uuid, bugHost, p);
                msg += `\n*Path ${p}:*\n\`\`\`${vless}\`\`\`\n`;
            }

            await sock.sendMessage(chatId, { text: msg });
        }

        // Also send a subscription file (base64 list) — V2RayNG can import this as a local sub
        try {
            const links = [];
            for (const bugHost of BUG_HOSTS) {
                for (const p of pathsToTry) {
                    links.push(makeVmessLink(workerUrl, uuid, bugHost, p));
                    links.push(makeVlessLink(workerUrl, uuid, bugHost, p));
                }
            }
            const subContent = Buffer.from(links.join('\n')).toString('base64');
            const tmpFile = path.join(os.tmpdir(), `airtel-sub-${Date.now()}.txt`);
            fs.writeFileSync(tmpFile, subContent);
            await sock.sendMessage(chatId, {
                document: fs.readFileSync(tmpFile),
                mimetype: 'text/plain',
                fileName: 'airtel-ug-subscription.txt',
                caption: '📋 *V2RayNG Subscription file*\nOpen V2RayNG → ☰ → Subscription → ➕ → paste a URL *or* save this file locally and import it.\n\nContains all bug hosts × all path variants.'
            });
            fs.unlinkSync(tmpFile);
        } catch {}

        await sock.sendMessage(chatId, {
            text: '✅ Done!\n\n*Steps in V2RayNG:*\n1. Tap ➕ → Import config from clipboard\n2. Paste a link above\n3. Tap the config → Test connection\n4. If it fails, try the next path variant\n\n💡 The path that matches your Cloudflare Worker is the one that will connect.'
        }, { quoted: message });
    }
};
