import { getSessionBase64 } from '../lib/sessionBackup.js';

export default {
    command: 'getsession',
    aliases: ['sessionbackup', 'savesession', 'myid'],
    category: 'owner',
    description: 'Get your current session credentials (base64)',
    usage: '.getsession',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        try {
            await sock.sendMessage(chatId, {
                text: '🔐 Reading your session...'
            }, { quoted: message });

            const sessionBase64 = getSessionBase64();

            const msg =
                `🔐 *YOUR SESSION CREDENTIALS*\n\n` +
                `Your session is already saved locally on the server in \`session/creds.json\`.\n` +
                `On bot-hosting.net (Pterodactyl), this file persists between restarts automatically — *no action needed.*\n\n` +
                `📌 *Base64 Session (for manual backup only):*\n` +
                `\`${sessionBase64}\`\n\n` +
                `✅ Your bot will reconnect after any restart without re-pairing.\n\n` +
                `⚠️ _Keep this private. Anyone with this can access your WhatsApp._`;

            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ ${error.message}`
            }, { quoted: message });
        }
    }
};
