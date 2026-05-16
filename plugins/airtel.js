import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode';
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

function makeVlessLink(workerUrl, uuid, bugHost) {
    // Do NOT use encodeURIComponent on the path — many clients parse %2F as literal
    const wsPath = '/vless';
    return `vless://${uuid}@${workerUrl}:443?encryption=none&security=tls&sni=${workerUrl}&type=ws&host=${bugHost}&path=${wsPath}#Airtel-UG-${bugHost}`;
}

function makeHttpCustomJson(workerUrl, uuid, bugHost) {
    return {
        server: workerUrl,
        port: 443,
        protocol: 'vless',
        uuid: uuid,
        tls: true,
        sni: workerUrl,
        transport: 'ws',
        ws_path: '/vless',
        ws_host: bugHost,
        bug: bugHost,
        remarks: `Airtel-UG-${bugHost}`
    };
}

const BUG_HOSTS = [
    'web.whatsapp.com',
    'mmg.whatsapp.net',
    'airtel.co.ug',
    'selfcare.ug.airtel.com',
    'media.whatsapp.net',
    'static.whatsapp.net',
    '0.facebook.com',
    'graph.facebook.com',
];

export default {
    command: 'airtel',
    aliases: ['airtelug'],
    category: 'tools',
    description: 'Generate free Airtel Uganda internet configs for HTTP Custom / V2RayNG',
    usage: '.airtel',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const config = getConfig();

        if (!config) {
            return sock.sendMessage(chatId, {
                text: '❌ Airtel config not set up yet.\nOwner must run:\n.airtelsetup <worker-url> <uuid>'
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: '⏳ Generating Airtel Uganda free internet configs...'
        }, { quoted: message });

        const allConfigs = [];

        for (const bugHost of BUG_HOSTS) {
            const link = makeVlessLink(config.workerUrl, config.uuid, bugHost);
            const hcJson = makeHttpCustomJson(config.workerUrl, config.uuid, bugHost);
            allConfigs.push({ bugHost, link, hcJson });

            try {
                const qrBuffer = await qrcode.toBuffer(link, { errorCorrectionLevel: 'M', width: 400 });
                await sock.sendMessage(chatId, {
                    image: qrBuffer,
                    caption: `🇺🇬 *Airtel Uganda Free Internet*\n\n🐛 Bug Host: \`${bugHost}\`\n\n📋 *VLESS Link:*\n\`\`\`${link}\`\`\`\n\n📲 Scan QR in HTTP Custom or copy link to V2RayNG`
                });
            } catch {
                await sock.sendMessage(chatId, {
                    text: `🐛 *${bugHost}*\n${link}`
                });
            }
        }

        // Send combined HTTP Custom JSON file for easy import
        try {
            const hcBundle = allConfigs.map(c => c.hcJson);
            const tmpFile = path.join(os.tmpdir(), `airtel-ug-${Date.now()}.json`);
            fs.writeFileSync(tmpFile, JSON.stringify(hcBundle, null, 2));
            await sock.sendMessage(chatId, {
                document: fs.readFileSync(tmpFile),
                mimetype: 'application/json',
                fileName: 'Airtel-UG-Configs.json',
                caption: `📁 HTTP Custom config file — import all ${BUG_HOSTS.length} configs at once`
            });
            fs.unlinkSync(tmpFile);
        } catch {}

        await sock.sendMessage(chatId, {
            text: "✅ Done! Try each config — the bug host that matches Airtel's zero-rated sites will work.\n\n💡 *How to use:*\n• *HTTP Custom:* Import the JSON file → connect\n• *V2RayNG:* Copy a VLESS link → import from clipboard\n• *QR:* Scan in HTTP Custom app"
        }, { quoted: message });
    }
};
