import fs from 'fs';
import { dataFile } from '../lib/paths.js';
import store from '../lib/lightweight_store.js';

const AUTO_AI_FILE = dataFile('autoAi.json');
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);

async function getAutoAiChats() {
    try {
        if (HAS_DB) {
            return (await store.getSetting('global', 'autoAi')) || {};
        }
        if (!fs.existsSync(AUTO_AI_FILE)) return {};
        return JSON.parse(fs.readFileSync(AUTO_AI_FILE, 'utf8'));
    } catch { return {}; }
}

async function setAutoAiChats(data) {
    try {
        if (HAS_DB) {
            await store.saveSetting('global', 'autoAi', data);
        } else {
            fs.writeFileSync(AUTO_AI_FILE, JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('autoAi save error:', e.message);
    }
}

export default {
    command: 'aioff',
    aliases: ['disableai'],
    category: 'ai',
    description: 'Disable AI auto-reply in this chat',
    usage: '.aioff',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const chats = await getAutoAiChats();
        if (!chats[chatId]) {
            return sock.sendMessage(chatId, {
                text: '⚠️ AI auto-reply is already *OFF* in this chat.\nUse *.aion* to enable it.'
            }, { quoted: message });
        }
        delete chats[chatId];
        await setAutoAiChats(chats);
        return sock.sendMessage(chatId, {
            text: `❌ *AI Auto-Reply: OFF*\n\n` +
                `I will no longer auto-reply to messages in this chat.\n\n` +
                `Use *.aion* to turn back on.`
        }, { quoted: message });
    }
};
