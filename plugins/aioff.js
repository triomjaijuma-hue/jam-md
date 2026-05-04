import fs from 'fs';
import { dataFile } from '../lib/paths.js';

const AION_FILE = dataFile('aion_chats.json');

function loadAionData() {
    try {
        if (fs.existsSync(AION_FILE)) return JSON.parse(fs.readFileSync(AION_FILE, 'utf-8'));
    } catch {}
    return { chats: {} };
}

function saveAionData(data) {
    try {
        fs.writeFileSync(AION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[aioff] save error:', e.message);
    }
}

export default {
    command: 'aioff',
    aliases: ['aistop', 'stopai'],
    category: 'owner',
    description: 'Disable always-on AI replies for this chat',
    usage: '.aioff',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const data = loadAionData();

        if (!data.chats[chatId]) {
            return sock.sendMessage(chatId, {
                text: '⚠️ *AI is not ON for this chat.*\n\nUse *.aion* to enable it.',
                ...channelInfo
            }, { quoted: message });
        }

        delete data.chats[chatId];
        saveAionData(data);

        return sock.sendMessage(chatId, {
            text: '🔴 *AI Mode OFF!*\n\nI will no longer auto-reply in this chat.\n\n_Use *.aion* to re-enable._',
            ...channelInfo
        }, { quoted: message });
    }
};
