import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

export default {
    command: 'airtelsetup',
    aliases: [],
    category: 'tools',
    description: 'Set Cloudflare Worker URL, UUID and WebSocket path for Airtel Uganda configs',
    usage: '.airtelsetup <worker-url> <uuid> [ws-path]',
    strictOwnerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const [workerUrl, uuid, wsPath] = args;

        if (!workerUrl || !uuid) {
            return sock.sendMessage(chatId, {
                text: [
                    '❌ Usage: .airtelsetup <worker-url> <uuid> [ws-path]',
                    '',
                    'Examples:',
                    '• edtunnel worker (path = UUID):',
                    '  .airtelsetup myworker.workers.dev 1c0aed11-4836-4431-b028-14e15dfe033c',
                    '',
                    '• Custom path:',
                    '  .airtelsetup myworker.workers.dev 1c0aed11-xxxx /vless',
                    '',
                    'Tip: If unsure of the path, leave it out — the bot will try /UUID, /vless, / and /ws automatically.'
                ].join('\n')
            }, { quoted: message });
        }

        const cleanUrl = workerUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

        // Default path logic:
        // - If user gave a path, use it
        // - Otherwise default to /${uuid} (edtunnel style, most common)
        const resolvedPath = wsPath
            ? (wsPath.startsWith('/') ? wsPath : '/' + wsPath)
            : `/${uuid}`;

        const config = { workerUrl: cleanUrl, uuid, wsPath: resolvedPath };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

        await sock.sendMessage(chatId, {
            text: [
                '✅ Airtel config saved!',
                `🌐 Worker: ${config.workerUrl}`,
                `🔑 UUID: ${config.uuid}`,
                `📁 WS Path: ${config.wsPath}`,
                '',
                'Run *.airtel* to generate configs.',
                'The bot will also auto-try /vless, /, /ws in case the path above is wrong.'
            ].join('\n')
        }, { quoted: message });
    }
};
