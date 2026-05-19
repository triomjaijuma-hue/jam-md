import fs from 'fs';
import path from 'path';
import { dataFile } from '../lib/paths.js';
import store from '../lib/lightweight_store.js';

const AUTO_AI_FILE = dataFile('autoAi.json');
const DM_AI_FILE = dataFile('dmAiAll.json');
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);

async function getAutoAiChats() {
    try {
        if (HAS_DB) return (await store.getSetting('global', 'autoAi')) || {};
        if (!fs.existsSync(AUTO_AI_FILE)) return {};
        return JSON.parse(fs.readFileSync(AUTO_AI_FILE, 'utf8'));
    } catch { return {}; }
}

async function setAutoAiChats(data) {
    try {
        if (HAS_DB) { await store.saveSetting('global', 'autoAi', data); }
        else { fs.writeFileSync(AUTO_AI_FILE, JSON.stringify(data, null, 2)); }
    } catch (e) { console.error('autoAi save error:', e.message); }
}

async function getDmAiState() {
    try {
        if (HAS_DB) return (await store.getSetting('global', 'dmAiAll')) || { enabled: false, excluded: [] };
        if (!fs.existsSync(DM_AI_FILE)) return { enabled: false, excluded: [] };
        const data = JSON.parse(fs.readFileSync(DM_AI_FILE, 'utf8'));
        return { enabled: data.enabled || false, excluded: data.excluded || [] };
    } catch { return { enabled: false, excluded: [] }; }
}

async function setDmAiState(data) {
    try {
        if (HAS_DB) { await store.saveSetting('global', 'dmAiAll', data); }
        else {
            const dir = path.dirname(DM_AI_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(DM_AI_FILE, JSON.stringify(data, null, 2));
        }
    } catch (e) { console.error('dmAi save error:', e.message); }
}

export default {
    command: 'aioff',
    aliases: ['disableai'],
    category: 'ai',
    description: 'Disable AI auto-reply in this specific chat',
    usage: '.aioff',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;

        const [chats, dmState] = await Promise.all([getAutoAiChats(), getDmAiState()]);

        const inPerChat = !!chats[chatId];
        const activeViaGlobal = dmState.enabled && !dmState.excluded.includes(chatId);

        if (!inPerChat && !activeViaGlobal) {
            return sock.sendMessage(chatId, {
                text: '⚠️ AI auto-reply is already *OFF* in this chat.\nUse *.aion* to enable it.'
            }, { quoted: message });
        }

        // Remove from per-chat store if it was there
        if (inPerChat) {
            delete chats[chatId];
            await setAutoAiChats(chats);
        }

        // If global DM AI is on, add this chat to the exclusion list
        if (dmState.enabled && !dmState.excluded.includes(chatId)) {
            dmState.excluded.push(chatId);
            await setDmAiState(dmState);
        }

        return sock.sendMessage(chatId, {
            text: `❌ *AI Auto-Reply: OFF*\n\n` +
                `AI will no longer reply in this chat.\n` +
                (dmState.enabled
                    ? `_(Note: Global DM AI is still ON — this chat is now excluded from it)_\n\n`
                    : `\n`) +
                `Use *.aion* to turn back on in this chat.`
        }, { quoted: message });
    }
};
