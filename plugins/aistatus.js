import fs from 'fs';
import { dataFile } from '../lib/paths.js';
import { ugaFormat, ugaNow } from '../lib/ugaTime.js';

const AION_FILE = dataFile('aion_chats.json');

function loadAionData() {
    try {
        if (fs.existsSync(AION_FILE)) return JSON.parse(fs.readFileSync(AION_FILE, 'utf-8'));
    } catch {}
    return { chats: {} };
}

export default {
    command: 'aistatus',
    aliases: ['ailist', 'aichats'],
    category: 'ai',
    description: 'Show all chats with always-on AI enabled',
    usage: '.aistatus',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const data = loadAionData();
        const chats = Object.entries(data.chats || {});

        if (chats.length === 0) {
            return sock.sendMessage(chatId, {
                text: '🤖 *AI Status*\n\n❌ No chats have always-on AI enabled.\n\n_Use *.aion* in any chat to enable it._',
                ...channelInfo
            }, { quoted: message });
        }

        let text = `🤖 *Always-On AI Status*\n`;
        text += `🕐 _${ugaNow()} (EAT)_\n`;
        text += `━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `*Active chats:* ${chats.length}\n\n`;

        chats.forEach(([jid, info], i) => {
            const isGroup = jid.endsWith('@g.us');
            const label = isGroup ? '👥 Group' : '👤 DM';
            const number = jid.split('@')[0];
            const enabledAt = info.enabledAt ? ugaFormat(info.enabledAt) : 'Unknown';
            text += `*${i + 1}.* ${label}\n`;
            text += `   📌 ID: \`${number}\`\n`;
            text += `   ⏰ Enabled: ${enabledAt}\n\n`;
        });

        text += `━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Use *.aioff* in any chat to disable AI there._`;

        return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
    }
};
